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

export function activateStorageAccess() {
  return (activation ??= activate());
}

async function activate() {
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
  await new Promise<void>((resolve) => {
    const onContinue = async () => {
      show(StorageAccess, { busy: true, onContinue });
      try {
        await requestAndInstall(request);
        clear();
        setVisible(false);
        resolve();
      } catch (error) {
        show(StorageAccess, { error: true, onContinue });
      }
    };
    setVisible(true);
    show(StorageAccess, { onContinue });
  });
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
