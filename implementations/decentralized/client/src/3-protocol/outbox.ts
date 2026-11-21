import { GraffitiErrorNotFound, type GraffitiObjectBase } from "@graffiti-garden/api";
import type { RecordKind } from "./3-object-encoding";
import { cacheBatch, createCache } from "./4-discovery/cache";

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

/**
 * Local writes and their synchronization state. Completed records are retained
 * for local reads and discovery; successful uploads release their encoded bytes.
 * Like the discovery cache, this uses partitioned Cache storage and Web Locks.
 * Without persistent browser storage the caller must finish uploading before
 * acknowledging a write, rather than promise durability from an in-memory queue.
 */
export class Outbox {
  readonly store = createCache<PendingWrite | number>("graffiti-outbox-v1");
  private syncing = new Map<string, Promise<void>>();

  async get(url: string): Promise<PendingWrite | undefined> {
    const value = await (await this.store).get(url);
    return typeof value === "object" ? value : undefined;
  }

  /** Snapshot both the records and their logical clock under the same lock. */
  async read() {
    const store = await this.store;
    return store.lock(async () => ({
      clock: (await store.get("clock") as number | undefined) ?? 0,
      writes: (await cacheBatch((await store.keys()).filter(key => key !== "clock"), key => this.get(key)))
        .filter((write): write is PendingWrite => write !== undefined),
    }), "shared");
  }

  async put(write: Omit<PendingWrite, "modified">) {
    const store = await this.store;
    await store.lock(async () => {
      const modified = ((await store.get("clock") as number | undefined) ?? 0) + 1;
      await store.set("clock", modified);
      await store.set(write.object.url, { ...write, modified });
    });
  }

  async delete(url: string): Promise<PendingWrite> {
    const store = await this.store;
    return store.lock(async () => {
      const write = await this.get(url);
      if (!write || write.tombstone) throw new GraffitiErrorNotFound("Object not found");
      write.tombstone = true;
      // A write which never started uploading can be canceled entirely locally.
      write.pending = write.started;
      write.objectBytes = null;
      write.mediaBytes = null;
      write.due = Date.now();
      write.modified = ((await store.get("clock") as number | undefined) ?? 0) + 1;
      await store.set("clock", write.modified);
      await store.set(url, write);
      return write;
    });
  }

  /** Serialize uploads of a URL, including across tabs, without blocking local deletes. */
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
            if (current?.modified === write.modified) {
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
          if (!current || current.modified !== write.modified) return;
          current.pending = false;
          current.objectBytes = null;
          current.mediaBytes = null;
          await store.set(url, current);
        });
      }
    };
    const result = store.shared
      ? navigator.locks.request(`graffiti:outbox:${url}`, work)
      : work();
    this.syncing.set(url, result);
    try { await result; }
    finally { if (this.syncing.get(url) === result) this.syncing.delete(url); }
  }
}
