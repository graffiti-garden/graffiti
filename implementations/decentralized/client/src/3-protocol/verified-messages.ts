import { openDB, type DBSchema } from "idb";
import { canUseIDB } from "../1-services/4-inboxes/cache";
import type { InboxMessageBase } from "../1-services/4-inboxes/messages";

export type VerifiedMessage = {
  scope: string | null;
  inbox: string;
  message: InboxMessageBase;
  storageKey: string;
  missing?: boolean;
};
type State = { generation?: string; messages: VerifiedMessage[] };
interface VerifiedDatabase extends DBSchema {
  objects: { key: string; value: State };
}

// Raw inbox messages are untrusted. Only this protocol-owned cache records
// successful object validation and subsequent absence at a particular key.
// Missing keys do not blacklist a URL: a later verified announcement can live
// under another key (or restore the same one after a new storage read).
export class VerifiedMessages {
  private readonly memory = new Map<string, State>();
  private database?: Promise<Awaited<ReturnType<typeof openDB<VerifiedDatabase>>> | undefined>;

  private db() {
    return this.database ??= canUseIDB().then((available) => available
      ? openDB<VerifiedDatabase>("graffiti-verified-messages-v1", 1, {
          upgrade(db) { db.createObjectStore("objects"); },
        })
      : undefined);
  }

  async read(url: string): Promise<State> {
    const db = await this.db();
    return (db ? await db.get("objects", url) : structuredClone(this.memory.get(url))) ?? { messages: [] };
  }

  async list(url: string, scope: string | null): Promise<VerifiedMessage[]> {
    return (await this.read(url)).messages.filter((entry) => entry.scope === scope);
  }

  private async update<T>(url: string, change: (state: State) => T): Promise<T> {
    const db = await this.db();
    if (db) {
      const tx = db.transaction("objects", "readwrite");
      const state = await tx.store.get(url) ?? { messages: [] };
      const result = change(state);
      await tx.store.put(state, url);
      await tx.done;
      return result;
    }
    const state = this.memory.get(url) ?? { messages: [] };
    const result = change(state);
    this.memory.set(url, structuredClone(state));
    return result;
  }

  async remember(entry: VerifiedMessage, generation: string | undefined): Promise<boolean> {
    return this.update(entry.message.m.o.url, (state) => {
      // A validation started before a known removal cannot resurrect it, even
      // if another tab was processing the same raw message at the time.
      if (state.generation !== generation) return false;
      const previous = state.messages.findIndex((m) => m.scope === entry.scope &&
        m.inbox === entry.inbox && m.message.id === entry.message.id);
      if (previous < 0) state.messages.push(entry);
      else state.messages[previous] = entry;
      return true;
    });
  }

  async missing(url: string, storageKey: string): Promise<void> {
    await this.update(url, (state) => {
      state.generation = crypto.randomUUID();
      for (const entry of state.messages) {
        if (entry.storageKey === storageKey) entry.missing = true;
      }
    });
  }
}
