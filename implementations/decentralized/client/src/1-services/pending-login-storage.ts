const maxAge = 10 * 60 * 1000;

/** Redirect state keyed by an unpredictable ID, independent of a tab's sessionStorage. */
export class PendingLoginStorage {
  constructor(private prefix: string) {}

  save(id: string, value: unknown) {
    if (typeof window === "undefined") return;
    const storage = window.localStorage;
    // Expired, abandoned redirects must not accumulate indefinitely.
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(this.prefix)) this.read(key);
    }
    storage.setItem(this.prefix + id, JSON.stringify({
      expiresAt: Date.now() + maxAge, value,
    }));
  }

  load(id: string): unknown {
    if (typeof window === "undefined") return;
    return this.read(this.prefix + id);
  }

  remove(id: string) {
    if (typeof window !== "undefined") window.localStorage.removeItem(this.prefix + id);
  }

  private read(key: string): unknown {
    const saved = window.localStorage.getItem(key);
    if (!saved) return;
    try {
      const record = JSON.parse(saved);
      if (Number.isFinite(record?.expiresAt) && record.expiresAt > Date.now()) {
        return record.value;
      }
    } catch { /* Discard malformed or expired state. */ }
    window.localStorage.removeItem(key);
  }
}
