import StorageAccess from "../ui/StorageAccess.vue";
import { show, withPrompt } from "../ui/show.js";

export function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {}
}

/** Restore existing access silently. A new visitor must never see a prompt. */
export async function restoreStorageAccess(): Promise<boolean> {
  if (!document.requestStorageAccess) return !!getLocalStorage();
  let allowed = false;
  try {
    allowed = await document.hasStorageAccess?.() ?? false;
  } catch {}
  if (!allowed) {
    try {
      // Safari Private Browsing can leave this query pending indefinitely.
      // A silent convenience check must not block anonymous browsing.
      const permission = await Promise.race([
        navigator.permissions.query({ name: "storage-access" as PermissionName }),
        new Promise<undefined>(resolve => setTimeout(resolve, 1_000)),
      ]);
      allowed = permission?.state === "granted";
    } catch {}
  }
  if (!allowed) return false;
  try {
    await document.requestStorageAccess();
    return !!getLocalStorage();
  } catch {
    return false;
  }
}

/** Cookies are needed once to import the chosen login from the top-level visit. */
export function activateStorageAccess(): Promise<boolean> {
  return withPrompt(() => new Promise((resolve) => {
    const onCancel = () => resolve(false);
    const onContinue = async () => {
      show(StorageAccess, { busy: true, onContinue, onCancel });
      try {
        // This call must run inside the iframe's button-click handler.
        // Keep native localStorage/IndexedDB; only shared cookies are needed here.
        await document.requestStorageAccess?.();
        if (!getLocalStorage()) throw new Error("Login storage is unavailable.");
        resolve(true);
      } catch {
        show(StorageAccess, { error: true, onContinue, onCancel });
      }
    };
    show(StorageAccess, { onContinue, onCancel });
  }));
}
