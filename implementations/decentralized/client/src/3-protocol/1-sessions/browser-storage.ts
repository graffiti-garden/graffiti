import Cookies from "js-cookie";

// Cookies share a login with a newly visited embedding site after storage access.
// A partitioned cookie backs up the local copy: Safari can discard an iframe's
// localStorage on exit, but keeps this cookie without renewed cross-site access.
// Both copies stay on the implementation's origin, partitioned by embedding site.

const BROWSER_STORAGE_EXPIRATION_DAYS = 365;

export function writeCookie(key: string, value: string): void {
  try { Cookies.set(key, value, cookieOptions()); } catch {}
}

export function readCookie(key: string): string | undefined {
  try { return Cookies.get(key); } catch {}
}

export function readSavedLogin(key: string): string | undefined {
  // Missing data (not an exception) is the Safari case. The existing catch is
  // for browsers that block storage access altogether.
  try {
    const local = window.localStorage.getItem(key);
    if (local !== null) return local;
  } catch {}
  return readCookie(key + "-partitioned");
}

export function writeSavedLogin(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch {}
  try {
    if (window.location.protocol !== "https:") return;
    const name = key + "-partitioned";
    // An oversized cookie write can silently leave the previous value intact.
    // Empty the backup instead; the full login still lives in localStorage.
    const encoded = Cookies.converter.write(value, name);
    const stored = encodeURIComponent(name).length + encoded.length > 3800 ? "" : value;
    Cookies.set(name, stored, { ...cookieOptions(), partitioned: true });
  } catch {}
}

function cookieOptions(): Cookies.CookieAttributes {
  const attributes: Cookies.CookieAttributes = {
    expires: BROWSER_STORAGE_EXPIRATION_DAYS,
    path: "/",
    sameSite: "lax",
  };

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    attributes.sameSite = "none";
    attributes.secure = true;
  }

  return attributes;
}
