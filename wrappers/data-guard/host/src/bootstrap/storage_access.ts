import StorageAccess from "../ui/StorageAccess.vue";
import { show, withPrompt } from "../ui/show.js";

const storageTypes = {
  cookies: true,
  indexedDB: true,
  localStorage: true,
} as const;

type StorageAccessHandle = {
  indexedDB?: IDBFactory;
  localStorage?: Storage;
};

type StorageDocument = Document & {
  hasStorageAccess?: () => Promise<boolean>;
  requestStorageAccess?: (
    types?: typeof storageTypes,
  ) => Promise<StorageAccessHandle | void>;
};

export function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {}
}

/** Restore existing access silently. A new visitor must never see a prompt. */
export async function restoreStorageAccess(): Promise<boolean> {
  const storageDocument = document as StorageDocument;
  if (!storageDocument.requestStorageAccess) return !!getLocalStorage();
  let allowed = false;
  try {
    allowed = await storageDocument.hasStorageAccess?.() ?? false;
  } catch {}
  if (!allowed) {
    try {
      const permission = await navigator.permissions.query({
        name: "storage-access" as PermissionName,
      });
      allowed = permission.state === "granted";
    } catch {}
  }
  if (!allowed) return false;
  try {
    await requestAndInstall();
    return !!getLocalStorage();
  } catch {
    return false;
  }
}

/** Called only on return from login, before constructing Graffiti or its caches. */
export function activateStorageAccess(): Promise<boolean> {
  return withPrompt(() => new Promise((resolve) => {
    const onCancel = () => resolve(false);
    const onContinue = async () => {
      show(StorageAccess, { busy: true, onContinue, onCancel });
      try {
        // This call must run inside the iframe's button-click handler.
        await requestAndInstall();
        if (!getLocalStorage()) throw new Error("Login storage is unavailable.");
        resolve(true);
      } catch {
        show(StorageAccess, { error: true, onContinue, onCancel });
      }
    };
    show(StorageAccess, { onContinue, onCancel });
  }));
}

async function requestAndInstall() {
  const request = (document as StorageDocument).requestStorageAccess?.bind(document);
  if (!request) return;
  let handle: StorageAccessHandle | void;
  try {
    handle = await request(storageTypes);
  } catch (error) {
    // Older browsers implement only cookie access. Do not retry a denial.
    if (!(error instanceof TypeError)) throw error;
    handle = await request();
  }
  if (!handle) return;
  // Install shared handles before opening storage, never underneath live caches.
  for (const type of ["localStorage", "indexedDB"] as const) {
    if (handle[type]) {
      Object.defineProperty(window, type, {
        configurable: true,
        value: handle[type],
      });
    }
  }
}
