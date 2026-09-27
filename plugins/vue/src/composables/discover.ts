import type {
  GraffitiObject,
  GraffitiObjectStream,
  GraffitiObjectStreamError,
  GraffitiObjectStreamReturn,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import type { GraffitiObjectStreamSuccess } from "@graffiti-garden/wrapper-synchronize";
import { GraffitiErrorCursorExpired } from "@graffiti-garden/api";
import type { MaybeRefOrGetter, Ref } from "vue";
import { ref, toValue, watch, onScopeDispose } from "vue";
import { useGraffitiSynchronize } from "../globals";

const BATCH_PERIOD_MS = 50;

/**
 * The [Graffiti.discover](https://api.graffiti.garden/classes/Graffiti.html#discover)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiDiscover}.
 *
 * The arguments of this composable are largely the same as Graffiti.discover,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * There is one additional optional argument `autopoll`, which when `true`,
 * will automatically poll for new objects.
 * As they change the arguments change, the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 *
 * @returns
 * - `objects`: A [ref](https://vuejs.org/api/reactivity-core.html#ref) that contains
 * an array of Graffiti objects.
 * - `poll`: A function that can be called to manually check for objects.
 * If a poll is already running, it waits for that poll.
 * - `error`: A ref containing a failure of the entire discovery, or `null`.
 * On failure, retries are automatic (e.g. to reconnect to the network).
 * - `isFirstPoll`: A boolean [ref](https://vuejs.org/api/reactivity-core.html#ref)
 * that is `true` until the first successful discovery completes.
 */
export function useGraffitiDiscover<Schema extends JSONSchema>(
  channels: MaybeRefOrGetter<string[]>,
  schema: MaybeRefOrGetter<Schema>,
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
  /**
   * Whether to automatically poll for new objects.
   */
  autopoll: MaybeRefOrGetter<boolean> = false,
) {
  const graffiti = useGraffitiSynchronize();

  // Output
  const objectsRaw: Map<string, GraffitiObject<Schema>> = new Map();
  const objects: Ref<GraffitiObject<Schema>[]> = ref([]);
  const error = ref<Error | null>(null);
  let poll_ = async () => {};
  const poll = async () => poll_();
  const isFirstPoll = ref(true);

  // Maintain iterators for disposal
  let syncIterator: AsyncGenerator<GraffitiObjectStreamSuccess<Schema>>;
  let discoverIterator: GraffitiObjectStream<Schema>;
  onScopeDispose(async () => {
    await syncIterator?.return(null);
    await discoverIterator?.return({ cursor: "" });
  });

  const refresh = ref(0);
  const args_ = () =>
    [toValue(channels), toValue(schema), toValue(session)] as const;
  watch(
    () => `${refresh.value}:${JSON.stringify(args_())}`,
    (_, __, onInvalidate) => {
      const args = args_();

      // Reset the output
      objectsRaw.clear();
      objects.value = [];
      error.value = null;
      isFirstPoll.value = true;

      // Initialize new iterators
      const mySyncIterator = graffiti.synchronizeDiscover<Schema>(...args);
      syncIterator = mySyncIterator;
      let myDiscoverIterator: GraffitiObjectStream<Schema>;

      // Set up automatic iterator cleanup
      let active = true;
      let restartTimer: ReturnType<typeof setTimeout> | undefined;
      onInvalidate(async () => {
        active = false;
        if (restartTimer !== undefined) clearTimeout(restartTimer);
        await mySyncIterator.return(null);
        await myDiscoverIterator?.return({ cursor: "" });
      });
      function restartWatch(timeout = 0) {
        if (restartTimer !== undefined) clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          restartTimer = undefined;
          if (!active) return;
          refresh.value++;
        }, timeout);
      }

      // Start to synchronize in the background
      // (all polling results will go through here)
      let syncFailure: Error | null = null;
      let batchFlattenPromise: Promise<void> | undefined = undefined;
      let then = 0;
      (async () => {
        try {
          for await (const result of mySyncIterator) {
            if (!active) break;
            if (result.tombstone) {
              objectsRaw.delete(result.object.url);
            } else {
              objectsRaw.set(result.object.url, result.object);
            }

            const now = Date.now();
            if (!batchFlattenPromise) {
              // If many objects are being received back to back,
              // flatten them in batches to prevent
              // excessive re-rendering
              const timeoutLength =
                now - then < BATCH_PERIOD_MS ? BATCH_PERIOD_MS : 0;
              batchFlattenPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                  if (active) {
                    objects.value = Array.from(objectsRaw.values());
                  }
                  batchFlattenPromise = undefined;
                  resolve();
                }, timeoutLength);
              });
            }
            then = now;
          }
        } catch (e) {
          if (!active) return;
          syncFailure = e instanceof Error ? e : new Error(String(e));
          error.value = syncFailure;
          restartWatch(5000);
        }
      })();

      // Then set up a polling function
      let pollPromise: Promise<void> | undefined;
      let continueFn: () => GraffitiObjectStream<Schema> = () =>
        graffiti.discover<Schema>(...args);
      poll_ = () => {
        if (!active) return Promise.resolve();
        if (pollPromise) return pollPromise;

        if (!syncFailure) error.value = null;
        let completed = false;
        pollPromise = (async () => {
          let retryDelay: number | undefined;
          try {
            try {
              myDiscoverIterator = continueFn();
              discoverIterator = myDiscoverIterator;
            } catch (e) {
              error.value = e instanceof Error ? e : new Error(String(e));
              retryDelay = 5000;
              return;
            }

            while (active) {
              let result: IteratorResult<
                GraffitiObjectStreamSuccess<Schema> | GraffitiObjectStreamError,
                GraffitiObjectStreamReturn
              >;
              try {
                result = await myDiscoverIterator.next();
              } catch (e) {
                if (!active) return;
                if (
                  e instanceof GraffitiErrorCursorExpired ||
                  (e instanceof Error && e.name === "GraffitiErrorCursorExpired")
                ) {
                  // The cursor has expired; start discovery from scratch.
                  retryDelay = 0;
                } else {
                  error.value = e instanceof Error ? e : new Error(String(e));
                  retryDelay = 5000;
                }
                break;
              }
              if (!active) return;
              if (result.done) {
                continueFn = () =>
                  graffiti.continueDiscover<Schema>(result.value.cursor, args[2]);
                completed = true;
                break;
              } else if (result.value.error) {
                // An origin can fail without stopping the rest of discovery.
                console.error(result.value.error);
              }
            }
          } finally {
            // Let synchronized results reach Vue before the poll settles.
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (batchFlattenPromise) await batchFlattenPromise;
            if (active) {
              if (completed && !syncFailure) {
                if (restartTimer !== undefined) clearTimeout(restartTimer);
                restartTimer = undefined;
                isFirstPoll.value = false;
              }
              if (retryDelay !== undefined) restartWatch(retryDelay);
            }
          }
        })().finally(() => {
          pollPromise = undefined;
          if (active && completed && !syncFailure && toValue(autopoll)) void poll_();
        });
        return pollPromise;
      };
      void poll();
    },
    { immediate: true },
  );

  // Start polling if autopoll turns true
  watch(
    () => toValue(autopoll),
    (value) => value && poll(),
  );

  return {
    objects,
    error,
    poll,
    isFirstPoll,
  };
}
