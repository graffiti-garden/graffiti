import Cookies from "js-cookie";

// The Storage Access API only exposes cookies, but not
// localstorage or indexedDB. Therefore, we must use cookies
// for storage that persists across iframes. This just involves
// session tokens, the rest of the storage is for in-process
// authorization, which cannot be done in an iframe anyways,
// and caching, which just adds efficiency.

const BROWSER_STORAGE_EXPIRATION_DAYS = 365;

export function setBrowserStorageItem(key: string, value: string): void {
  Cookies.set(key, value, getBrowserStorageOptions());
}

export function getBrowserStorageItem(key: string): string | undefined {
  return Cookies.get(key);
}

export function removeBrowserStorageItem(key: string): void {
  Cookies.remove(key, getBrowserStorageOptions());
}

function getBrowserStorageOptions(): Cookies.CookieAttributes {
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
