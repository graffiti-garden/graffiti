import { createCache } from "./cache";

export type MessageState = {
  scope: string | null;
  inbox: string;
  id: string;
  digest: string;
  storageKey: string;
  status: "pending" | "verified" | "invalid" | "deleted";
};

// Only Graffiti assigns verification/deletion state. Payloads live in the
// shared message store; these reader-scoped records contain references only.
export class VerificationState {
  private store = createCache<MessageState[]>("graffiti-verification-state-v2");

  async read(url: string): Promise<MessageState[]> {
    return (await (await this.store).get(url)) ?? [];
  }

  private async update<T>(url: string, change: (messages: MessageState[]) => T): Promise<T> {
    const store = await this.store;
    return store.lock(async () => {
      const messages = (await store.get(url)) ?? [];
      const result = change(messages);
      await store.set(url, messages);
      return result;
    });
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
