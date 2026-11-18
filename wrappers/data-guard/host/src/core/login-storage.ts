type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keep site consent across Safari clearing the embedded guard's localStorage. */
export function loginStorage(local: StorageLike | undefined): StorageLike | undefined {
  if (!local) return;
  function readCookie(key: string): string | undefined {
    try {
      const prefix = encodeURIComponent(key + "-partitioned") + "=";
      const cookie = document.cookie.split(";").map(value => value.trim())
        .find(value => value.startsWith(prefix));
      if (cookie) return decodeURIComponent(cookie.slice(prefix.length));
    } catch {}
  }

  function writeCookie(key: string, value: string) {
    try {
      if (window.location.protocol !== "https:") return;
      const name = encodeURIComponent(key + "-partitioned");
      // Leave room for attributes within the cookie's 4 KiB limit. Empty an
      // oversized backup instead of leaving an older approval list intact.
      const encoded = encodeURIComponent(value);
      const stored = name.length + encoded.length > 3800 ? "" : encoded;
      document.cookie = `${name}=${stored}; Path=/; Max-Age=31536000; SameSite=None; Secure; Partitioned`;
    } catch {}
  }

  return {
    getItem(key) {
      return local.getItem(key) ?? readCookie(key) ?? null;
    },
    setItem(key, value) {
      local.setItem(key, value);
      writeCookie(key, value);
    },
    removeItem(key) {
      local.removeItem(key);
      // Logout must clear the backup too.
      writeCookie(key, "");
    },
  };
}
