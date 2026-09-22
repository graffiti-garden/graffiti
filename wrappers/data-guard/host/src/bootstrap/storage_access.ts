import StorageAccess from "../ui/StorageAccess.vue";
import { clear, show } from "../ui/show.js";
import { setVisible } from "./protocol.js";

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

let activation: Promise<void> | undefined;

export function activateStorageAccess(pageUrl?: string) {
  return (activation ??= activate(pageUrl));
}

async function activate(pageUrl?: string) {
  const storageDocument = document as StorageDocument;
  const request = storageDocument.requestStorageAccess?.bind(document);
  if (!request) return;
  try {
    await requestAndInstall(request);
    return;
  } catch {}
  try {
    if (await storageDocument.hasStorageAccess?.()) return;
  } catch {}
  const setupUrl = storageSetupUrl(pageUrl);
  await new Promise<void>((resolve) => {
    const onContinue = async () => {
      show(StorageAccess, { busy: true, onContinue });
      try {
        await requestAndInstall(request);
        clear();
        setVisible(false);
        resolve();
      } catch (error) {
        if (setupUrl && openStorageSetup(setupUrl)) return;
        show(StorageAccess, { error: true, onContinue, setupUrl });
      }
    };
    setVisible(true);
    show(StorageAccess, { onContinue });
  });
}

function openStorageSetup(setupUrl: string) {
  try {
    if (!window.top || window.top === window) return false;
    window.top.location.href = setupUrl;
    return true;
  } catch {
    // A browser may consume the user activation after showing a native denial.
    return false;
  }
}

function storageSetupUrl(pageUrl?: string) {
  if (!pageUrl) return;
  const setupUrl = new URL(window.location.href);
  setupUrl.search = "";
  setupUrl.hash = "";
  setupUrl.searchParams.set("guardStorageSetup", "1");
  setupUrl.searchParams.set("redirectUrl", pageUrl);
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
