import Cookies from "js-cookie";

// Cookies share a login with a newly visited embedding site after storage access.
// A local copy lets that site resume the same login without cookie access later.
// Both stores stay on the implementation's origin. In browsers with partitioned
// storage, each embedding site keeps its own local copy.

const BROWSER_STORAGE_EXPIRATION_DAYS = 365;

export function writeCookie(key: string, value: string): void {
  try { Cookies.set(key, value, cookieOptions()); } catch {}
}

export function readCookie(key: string): string | undefined {
  try { return Cookies.get(key); } catch {}
}

export function readLocalStorage(key: string): string | undefined {
  try { return window.localStorage.getItem(key) ?? undefined; } catch {}
}

export function writeLocalStorage(key: string, value: string): void {
  // Cookie-based login still works if the browser cannot retain a local copy.
  try { window.localStorage.setItem(key, value); } catch {}
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
