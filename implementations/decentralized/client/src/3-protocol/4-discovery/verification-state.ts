import type { DBSchema, IDBPDatabase } from "idb";

export type MessageState = {
  scope: string | null;
  inbox: string;
  id: string;
  digest: string;
  storageKey: string;
  // Retain validation evidence after deletion; a failed read alone is not proof.
  verified?: true;
  firstMissing?: number;
  status: "pending" | "verified" | "invalid" | "deleted";
};

interface VerificationDB extends DBSchema {
  objects: { key: string; value: MessageState[] };
}

// Only Graffiti assigns verification/deletion state. Payloads live in the
// shared message store; these reader-scoped records contain references only.
export class VerificationState {
  private memory = new Map<string, MessageState[]>();
  private database?: Promise<IDBPDatabase<VerificationDB> | undefined>;

  private db() {
    return this.database ??= (async () => {
      if (!globalThis.indexedDB) return undefined;
      const { openDB } = await import("idb");
      return openDB<VerificationDB>("graffiti-verification-state-v2", 1, {
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

  async remember(url: string, entry: MessageState): Promise<MessageState["status"]> {
    return this.update(url, (messages) => {
      const previous = messages.find(m =>
        m.scope === entry.scope && m.inbox === entry.inbox && m.id === entry.id);
      if (previous && previous.digest !== entry.digest) {
        throw new Error("Inbox changed an existing announcement");
      }
      // A late read must not revive a key already observed missing. Other
      // storage keys for the same object remain independent (e.g. rotation).
      if (entry.status === "deleted") this.deleteKey(messages, entry.storageKey);
      const deleted = messages.some(m => m.storageKey === entry.storageKey && m.status === "deleted");
      const status = deleted ? "deleted"
        : previous && previous.status !== "pending" ? previous.status : entry.status;
      const verified = entry.status === "verified" || previous?.verified;
      if (previous) {
        previous.status = status;
        if (verified) previous.verified = true;
        if (entry.firstMissing !== undefined) previous.firstMissing ??= entry.firstMissing;
      } else messages.push({ ...entry, status, ...(verified ? { verified: true } : {}) });
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
