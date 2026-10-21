import type {
  GraffitiMedia,
  GraffitiMediaAccept,
  GraffitiSession,
} from "@graffiti-garden/api";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import type { MaybeRefOrGetter, Ref } from "vue";
import { ref, toValue, watch, onScopeDispose } from "vue";
import { useGraffitiSynchronize } from "../globals";

// Cache media in-memory for up to 5 minutes
// Polling clears this. This may show deleted media but saves
// a lot on performance (e.g. same profile picture shown in many places)
const CACHE_LIFETIME_MS = 5 * 60 * 1000;
const CACHE_MAX_BYTES = 128 * 1024 * 1024; // Per session

type CacheEntry = {
  promise: Promise<GraffitiMedia>;
  expiresAt?: number;
  bytes: number;
};

// Keep sessions separate so cached private media cannot be reused by another
// session. Weak keys also let the browser discard a logged-out session's cache.
const sessionCaches = new WeakMap<GraffitiSession, Map<string, CacheEntry>>();
const anonymousCache = new Map<string, CacheEntry>();

function cacheFor(session: GraffitiSession | undefined | null) {
  if (!session) return anonymousCache;
  let cache = sessionCaches.get(session);
  if (!cache) {
    cache = new Map();
    sessionCaches.set(session, cache);
  }
  return cache;
}

function trimCache(cache: Map<string, CacheEntry>) {
  let bytes = 0;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
      cache.delete(key);
    } else {
      bytes += entry.bytes;
    }
  }
  for (const [key, entry] of cache) {
    if (bytes <= CACHE_MAX_BYTES) break;
    if (entry.expiresAt === undefined) continue;
    cache.delete(key);
    bytes -= entry.bytes;
  }
}

/**
 * The [Graffiti.getMedia](https://api.graffiti.garden/classes/Graffiti.html#getMedia)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiGetMedia}.
 *
 * The arguments of this composable are the same as Graffiti.getMedia,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 *
 * @returns
 * - `media`: A [ref](https://vuejs.org/api/reactivity-core.html#ref) containing
 * the retrieved media, `undefined` while loading, or `null` if not found or the fetch fails.
 * Retrieved media includes a `dataUrl` for display in a template.
 * - `error`: A ref containing the fetch error for failures other than not found,
 * or `null` otherwise.
 * - `poll`: A function that can be called to manually check if the media has changed.
 *   Images are cached and shared across instances for up to five minutes; polling bypasses
 *   that cache and checks Graffiti again.
 */
export function useGraffitiGetMedia(
  url: MaybeRefOrGetter<string>,
  accept: MaybeRefOrGetter<GraffitiMediaAccept>,
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
): {
  media: Ref<(GraffitiMedia & { dataUrl: string }) | null | undefined>;
  error: Ref<Error | null>;
  poll: () => Promise<void>;
} {
  const graffiti = useGraffitiSynchronize();
  const media = ref<(GraffitiMedia & { dataUrl: string }) | null | undefined>(
    undefined,
  );
  const error = ref<Error | null>(null);

  // The "poll counter" is a hack to get
  // watch to refresh
  const pollCounter = ref(0);
  let pollPromise: Promise<void> | null = null;
  let resolvePoll = () => {};
  function poll() {
    if (pollPromise) return pollPromise;
    pollCounter.value++;
    // Wait until the watch finishes and calls
    // "pollResolve" to finish the poll
    pollPromise = new Promise<void>((resolve) => {
      resolvePoll = () => {
        pollPromise = null;
        resolve();
      };
    });
    return pollPromise;
  }

  const args_ = () =>
    [toValue(url), toValue(accept), toValue(session)] as const;
  let handledPollCounter = pollCounter.value;

  watch(
    () => `${pollCounter.value}:${JSON.stringify(args_())}`,
    async (_, __, onInvalidate) => {
      const args = args_();
      const currentPollCounter = pollCounter.value;
      const force = currentPollCounter !== handledPollCounter;
      handledPollCounter = currentPollCounter;

      // Revoke the data URL to prevent a memory leak
      if (media.value?.dataUrl) {
        URL.revokeObjectURL(media.value.dataUrl);
      }
      media.value = undefined;
      error.value = null;

      let active = true;
      onInvalidate(() => {
        active = false;
      });

      try {
        const cache = cacheFor(args[2]);
        const key = JSON.stringify([args[0], args[1]]);
        let entry = cache.get(key);
        if (
          force ||
          (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now())
        ) {
          cache.delete(key);
          entry = undefined;
        }
        if (entry) {
          // Move a cache hit to the end so older images are evicted first.
          cache.delete(key);
          cache.set(key, entry);
        } else {
          entry = { promise: graffiti.getMedia(...args), bytes: 0 };
          cache.set(key, entry);
          const fetched = entry;
          void fetched.promise.then(
            (result) => {
              if (cache.get(key) !== fetched) return;
              if (
                !result.data.type.startsWith("image/") ||
                result.data.size > CACHE_MAX_BYTES
              ) {
                cache.delete(key);
                return;
              }
              fetched.bytes = result.data.size;
              fetched.expiresAt = Date.now() + CACHE_LIFETIME_MS;
              trimCache(cache);
            },
            () => {
              if (cache.get(key) === fetched) cache.delete(key);
            },
          );
        }
        const { data, actor, allowed } = await entry.promise;
        if (!active) return;
        const dataUrl = URL.createObjectURL(data);
        media.value = {
          data,
          dataUrl,
          actor,
          allowed,
        };
      } catch (e) {
        if (!active) return;
        if (
          !(
            e instanceof GraffitiErrorNotFound ||
            (e instanceof Error && e.name === "GraffitiErrorNotFound")
          )
        ) {
          error.value = e instanceof Error ? e : new Error(String(e));
        }
        media.value = null;
      } finally {
        // An invalidated request must not complete a newer poll.
        if (active && currentPollCounter === pollCounter.value) resolvePoll();
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    resolvePoll();
    if (media.value?.dataUrl) {
      URL.revokeObjectURL(media.value.dataUrl);
    }
  });

  return {
    media,
    error,
    poll,
  };
}
