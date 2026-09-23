import StorageAccess from "../ui/StorageAccess.vue";
import { clear, show } from "../ui/show.js";
import { requestStorageSetup, setVisible } from "./protocol.js";

const storageTypes = {
  cookies: true,
  indexedDB: true,
  localStorage: true,
} as const;

const storageSetupKey = "graffiti-guard:storage-setup";

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

let activation: Promise<void> | undefined;

export function activateStorageAccess(pageUrl?: string) {
  return (activation ??= activate(pageUrl));
}

async function activate(pageUrl?: string) {
  // Keep this reference before Storage Access can replace window.localStorage
  // with an unpartitioned handle. This transient state belongs to the guard,
  // partitioned by the embedding site, rather than to the embedding client.
  const partitionedStorage = getLocalStorage();
  const storageSetupAttempted =
    getStorageItem(partitionedStorage, storageSetupKey) === "1";
  const storageDocument = document as StorageDocument;
  const request = storageDocument.requestStorageAccess?.bind(document);
  if (!request) return;
  try {
    await requestAndInstall(request);
    removeStorageItem(partitionedStorage, storageSetupKey);
    return;
  } catch {}
  try {
    if (await storageDocument.hasStorageAccess?.()) {
      removeStorageItem(partitionedStorage, storageSetupKey);
      return;
    }
  } catch {}
  const setupUrl = storageSetupUrl(pageUrl);
  await new Promise<void>((resolve) => {
    const onContinue = async () => {
      show(StorageAccess, {
        busy: true,
        finishing: storageSetupAttempted,
        onContinue,
      });
      try {
        await requestAndInstall(request);
        removeStorageItem(partitionedStorage, storageSetupKey);
        clear();
        setVisible(false);
        resolve();
      } catch (error) {
        if (setupUrl && !storageSetupAttempted) {
          setStorageItem(partitionedStorage, storageSetupKey, "1");
          requestStorageSetup(setupUrl);
          // Older clients ignore the navigation request, so retain the manual
          // recovery screen as a backward-compatible fallback.
          window.setTimeout(() => {
            if (document.visibilityState === "visible") {
              show(StorageAccess, { error: true, onContinue, setupUrl });
            }
          }, 1000);
          return;
        }
        show(StorageAccess, {
          error: true,
          finishing: storageSetupAttempted,
          onContinue,
          setupUrl,
        });
      }
    };
    setVisible(true);
    show(StorageAccess, { finishing: storageSetupAttempted, onContinue });
  });
}

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {}
}

function getStorageItem(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key);
  } catch {}
}

function setStorageItem(
  storage: Storage | undefined,
  key: string,
  value: string,
) {
  try {
    storage?.setItem(key, value);
  } catch {}
}

function removeStorageItem(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {}
}

function storageSetupUrl(pageUrl?: string) {
  if (!pageUrl) return;
  const setupUrl = new URL(window.location.href);
  setupUrl.search = "";
  setupUrl.hash = "";
  setupUrl.searchParams.set("guardStorageSetup", "1");
  setupUrl.hash = new URLSearchParams({ redirectUrl: pageUrl }).toString();
  return setupUrl.href;
}

async function requestAndInstall(
  request: NonNullable<StorageDocument["requestStorageAccess"]>,
) {
  let handle: StorageAccessHandle | void;
  try {
    handle = await request(storageTypes);
  } catch {
    // Some browsers implement only the original, untyped Storage Access API.
    handle = await request();
  }
  if (!handle) return;
  // idb and the decentralized implementation read these window globals, so
  // install any partitioned-storage handles before constructing either one.
  for (const type of ["localStorage", "indexedDB"] as const) {
    if (handle[type]) {
      Object.defineProperty(window, type, {
        configurable: true,
        value: handle[type],
      });
    }
  }
}
