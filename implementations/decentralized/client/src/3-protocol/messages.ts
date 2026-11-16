import type { JSONSchema } from "@graffiti-garden/api";
import type { DBSchema, IDBPDatabase } from "idb";
import type { Message } from "../1-services/4-inboxes";
import { encode as dagCborEncode } from "@ipld/dag-cbor";

export type Announcement<Schema extends JSONSchema = {}> = {
  id: string;
  m: Message<Schema>;
};

export type MessageState = {
  scope: string | null;
  inbox: string;
  message: Announcement;
  storageKey: string;
  status: "pending" | "verified" | "invalid" | "deleted";
};

export function sameAnnouncement(a: Announcement, b: Announcement): boolean {
  const original = dagCborEncode(a.m);
  const received = dagCborEncode(b.m);
  return original.length === received.length && original.every((byte, i) => byte === received[i]);
}

interface MessagesDB extends DBSchema {
  objects: { key: string; value: MessageState[] };
}

// Graffiti owns announcements it still needs and the results of verification.
// Inbox history is only a transport cache; it is never a source of this state.
export class ProtocolMessages {
  private memory = new Map<string, MessageState[]>();
  private database?: Promise<IDBPDatabase<MessagesDB> | undefined>;

  private db() {
    return this.database ??= (async () => {
      if (!globalThis.indexedDB) return undefined;
      const { openDB } = await import("idb");
      return openDB<MessagesDB>("graffiti-protocol-messages-v1", 1, {
        upgrade(db) { db.createObjectStore("objects"); },
      });
    })().catch(() => undefined);
  }

  async read(url: string): Promise<MessageState[]> {
    const db = await this.db();
    if (!db) return structuredClone(this.memory.get(url) ?? []);
    const tx = db.transaction("objects", "readonly");
    const [messages] = await Promise.all([tx.store.get(url), tx.done]);
    return messages ?? [];
  }

  private async update<T>(url: string, change: (messages: MessageState[]) => T): Promise<T> {
    const db = await this.db();
    if (db) {
      const tx = db.transaction("objects", "readwrite");
      const write = async () => {
        const messages = (await tx.store.get(url)) ?? [];
        const result = change(messages);
        await tx.store.put(messages, url);
        return result;
      };
      // Handle both request and transaction failures, even if one rejects first.
      const [result] = await Promise.all([write(), tx.done]);
      return result;
    }
    const messages = structuredClone(this.memory.get(url) ?? []);
    const result = change(messages);
    this.memory.set(url, structuredClone(messages));
    return result;
  }

  async remember(entry: MessageState): Promise<MessageState["status"]> {
    return this.update(entry.message.m.o.url, (messages) => {
      const previous = messages.find(m =>
        m.scope === entry.scope && m.inbox === entry.inbox && m.message.id === entry.message.id);
      if (previous && !sameAnnouncement(previous.message, entry.message)) {
        throw new Error("Inbox changed an existing announcement");
      }
      // A late read must not revive a key already observed missing. Other
      // storage keys for the same object remain independent (e.g. rotation).
      if (entry.status === "deleted") this.deleteKey(messages, entry.storageKey);
      const deleted = messages.some(m => m.storageKey === entry.storageKey && m.status === "deleted");
      const status = deleted ? "deleted"
        : previous && previous.status !== "pending" ? previous.status : entry.status;
      if (previous) previous.status = status;
      else messages.push({ ...entry, status });
      return status;
    });
  }

  async deleted(url: string, storageKey: string): Promise<void> {
    await this.update(url, messages => this.deleteKey(messages, storageKey));
  }

  private deleteKey(messages: MessageState[], storageKey: string): void {
    for (const message of messages) {
      if (message.storageKey === storageKey) message.status = "deleted";
    }
  }
}
