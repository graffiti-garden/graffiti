import { GraffitiErrorCursorExpired, GraffitiErrorNotFound, type GraffitiObjectBase } from "@graffiti-garden/api";
import type { RecordKind } from "./3-object-encoding";
import { cacheBatch, createCache, withLock } from "./4-discovery/cache";

/** The exact encoding is retained until upload succeeds, so retries keep the URL. */
export type PendingWrite = {
  object: GraffitiObjectBase;
  kind: RecordKind | null;
  tags: Uint8Array[];
  allowedTickets: Uint8Array[] | null;
  storageBucketKey: string;
  objectBytes: Uint8Array | null;
  mediaBytes: Uint8Array | null;
  tombstone: boolean;
  pending: boolean;
  started: boolean;
  modified: number;
  due: number;
};

type Change = Pick<PendingWrite, "object" | "kind" | "tombstone" | "pending" | "modified">;
// Discovery needs recent deletions, not an archive of every canceled frame.
// Older cursors expire just as they do when an inbox drops cached history.
const CHANGE_WINDOW = 1024;
const READ_CONCURRENCY = 8;
const changeKey = (clock: number) => `change:${clock % CHANGE_WINDOW}`;

/**
 * Only work awaiting synchronization belongs in the outbox. Successful uploads
 * and canceled posts are removed; a separate bounded log supports discovery.
 * Without persistent browser storage the caller must upload before acknowledging
 * a write, rather than promise durability from an in-memory queue.
 */
export class Outbox {
  readonly store = createCache<PendingWrite | number>("graffiti-outbox-v1");
  private readonly changes = createCache<Change>("graffiti-outbox-changes-v2");
  private recent = new Map<number, Change>();
  private syncing = new Map<string, Promise<void>>();

  async get(url: string): Promise<PendingWrite | undefined> {
    const value = await (await this.store).get(url);
    return typeof value === "object" ? value : undefined;
  }

  private async journal(write: PendingWrite) {
    const { object, kind, tombstone, pending, modified } = write;
    try {
      const change = { object, kind, tombstone, pending, modified };
      await (await this.changes).set(changeKey(modified), change);
      this.remember(change);
    } catch {
      // The write is already durable. A missing log entry expires the reader's
      // cursor; restarting discovery reads pending writes and persistent data.
    }
  }

  // Several channel queries share the same clock. Reuse this bounded log in
  // memory instead of decoding the same frames again for each signaling poll.
  private remember(change: Change) {
    this.recent.set(change.modified, change);
    if (this.recent.size > CHANGE_WINDOW) this.recent.delete(this.recent.keys().next().value!);
    return change;
  }

  private async current(urls?: string[]) {
    const store = await this.store;
    const keys = urls ?? (await store.keys()).filter(key => key !== "clock");
    const records = await cacheBatch(keys, key => this.get(key), READ_CONCURRENCY);
    return records.filter((write): write is PendingWrite => write !== undefined);
  }

  /** Uploads depend only on pending records, never on discovery's change log. */
  async pending(urls?: string[]) {
    const writes = await this.current(urls);
    return writes.filter(write => write.pending).map(write => ({
      url: write.object.url, actor: write.object.actor, due: write.due,
    }));
  }

  async read({ urls, since, pending, channels }: { urls?: string[]; since?: number; pending?: boolean; channels?: string[] } = {}) {
    const store = await this.store;
    const clock = await store.lock(async () => (await store.get("clock") as number | undefined) ?? 0, "shared");
    let writes: Change[];
    if (since !== undefined) {
      if (since > clock || clock - since > CHANGE_WINDOW) {
        throw new GraffitiErrorCursorExpired("Local write history expired; restart discovery");
      }
      const journal = await this.changes;
      const changes = await cacheBatch(
        Array.from({ length: clock - since }, (_, i) => since + i + 1),
        async sequence => {
          const change = this.recent.get(sequence) ?? await journal.get(changeKey(sequence));
          // A writer may wrap the log while this reader is decoding bodies.
          if (change?.modified !== sequence) throw new GraffitiErrorCursorExpired("Local write history expired; restart discovery");
          return this.remember(change);
        }, READ_CONCURRENCY,
      );
      writes = [...new Map(changes.map(write => [write.object.url, write])).values()];
    } else {
      writes = (await this.current(urls)).filter(write => write.modified <= clock);
    }
    return { clock, writes: structuredClone(writes.filter(write => (!pending || write.pending) &&
      (!channels || write.object.channels.some(channel => channels.includes(channel))))) };
  }

  async put(write: Omit<PendingWrite, "modified" | "due">, gracePeriod = 0) {
    const store = await this.store;
    await store.lock(async () => {
      const modified = ((await store.get("clock") as number | undefined) ?? 0) + 1;
      await store.set("clock", modified);
      // Lock contention must not consume the new write's grace period.
      const record = { ...write, modified, due: Date.now() + gracePeriod };
      await store.set(write.object.url, record);
      await this.journal(record);
    });
  }

  async delete(url: string): Promise<PendingWrite> {
    const store = await this.store;
    return store.lock(async () => {
      const write = await this.get(url);
      if (!write || write.tombstone) throw new GraffitiErrorNotFound("Object not found");
      write.tombstone = true;
      // Once an upload starts, its deletion must reach the service too.
      write.pending = write.started;
      write.objectBytes = null;
      write.mediaBytes = null;
      write.due = Date.now();
      write.modified = ((await store.get("clock") as number | undefined) ?? 0) + 1;
      await store.set("clock", write.modified);
      if (write.pending) await store.set(url, write);
      else await store.delete(url);
      await this.journal(write);
      return write;
    });
  }

  /** Serialize uploads of a URL, including across tabs, without blocking deletes. */
  async sync(url: string, persist: (write: PendingWrite) => Promise<void>): Promise<void> {
    const store = await this.store;
    const existing = this.syncing.get(url);
    if (existing) return existing;
    const work = async () => {
      while (true) {
        const write = await store.lock(async () => {
          const current = await this.get(url);
          if (!current?.pending) return;
          current.started = true;
          await store.set(url, current);
          return current;
        });
        if (!write) return;
        try { await persist(write); }
        catch (error) {
          await store.lock(async () => {
            const current = await this.get(url);
            if (current?.storageBucketKey === write.storageBucketKey && current.tombstone === write.tombstone) {
              current.due = Date.now() + 5000;
              await store.set(url, current);
            }
          });
          throw error;
        }
        await store.lock(async () => {
          const current = await this.get(url);
          // A delete accepted during upload must run next, never be overwritten
          // by the completion of the earlier post.
          if (current?.storageBucketKey === write.storageBucketKey && current.tombstone === write.tombstone) await store.delete(url);
        });
      }
    };
    const result = store.shared ? withLock(navigator.locks, `graffiti:outbox:${url}`, work) : work();
    this.syncing.set(url, result);
    try { await result; }
    finally { if (this.syncing.get(url) === result) this.syncing.delete(url); }
  }
}
