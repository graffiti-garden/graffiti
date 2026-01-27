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
 * - `isFirstPoll`: A boolean [ref](https://vuejs.org/api/reactivity-core.html#ref)
 * that indicates if the *first* poll after a change of arguments is currently running.
 * It may be used to show a loading spinner or disable a button, or it can be watched
 * to know when the `objects` array is ready to use.
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
  let poll_ = async () => {};
  const poll = async () => poll_();
  const isFirstPoll = ref(true);

  // Maintain iterators for disposal
  let syncIterator: AsyncGenerator<GraffitiObjectStreamSuccess<Schema>>;
  let discoverIterator: GraffitiObjectStream<Schema>;
  onScopeDispose(() => {
    syncIterator?.return(null);
    discoverIterator?.return({ cursor: "" });
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
      isFirstPoll.value = true;

      // Initialize new iterators
      const mySyncIterator = graffiti.synchronizeDiscover<Schema>(...args);
      syncIterator = mySyncIterator;
      let myDiscoverIterator: GraffitiObjectStream<Schema>;

      // Set up automatic iterator cleanup
      let active = true;
      onInvalidate(() => {
        active = false;
        mySyncIterator.return(null);
        myDiscoverIterator?.return({ cursor: "" });
      });
      function restartWatch(timeout = 0) {
        setTimeout(() => {
          if (!active) return;
          refresh.value++;
        }, timeout);
      }

      // Start to synchronize in the background
      // (all polling results will go through here)
      let batchFlattenPromise: Promise<void> | undefined = undefined;
      let then = 0;
      (async () => {
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
      })();

      // Then set up a polling function
      let polling = false;
      let continueFn: () => GraffitiObjectStream<Schema> = () =>
        graffiti.discover<Schema>(...args);
      poll_ = async () => {
        if (polling || !active) return;
        polling = true;

        // Try to start the iterator
        try {
          myDiscoverIterator = continueFn();
        } catch (e) {
          // Discovery is lazy so this should not happen,
          // wait a bit before retrying
          console.error("Fatal error in discover");
          console.error(e);
          return restartWatch(5000);
        }
        if (!active) return;
        discoverIterator = myDiscoverIterator;

        while (true) {
          let result: IteratorResult<
            GraffitiObjectStreamSuccess<Schema> | GraffitiObjectStreamError,
            GraffitiObjectStreamReturn
          >;
          try {
            result = await myDiscoverIterator.next();
          } catch (e) {
            if (e instanceof GraffitiErrorCursorExpired) {
              // The cursor has expired, we need to start from scratch.
              return restartWatch();
            } else {
              // If something else went wrong, wait a bit before retrying
              console.error("Fatal error in discover");
              console.error(e);
              return restartWatch(5000);
            }
          }
          if (!active) return;
          if (result.done) {
            continueFn = () =>
              graffiti.continueDiscover<Schema>(result.value.cursor, args[2]);
            break;
          } else if (result.value.error) {
            // Non-fatal errors do not stop the stream
            console.error(result.value.error);
          }
        }

        // Wait for sync to receive updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        // And wait for pending results to be flattened
        if (batchFlattenPromise) await batchFlattenPromise;

        if (!active) return;
        polling = false;
        isFirstPoll.value = false;
        if (toValue(autopoll)) poll();
      };
      poll();
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
    poll,
    isFirstPoll,
  };
}
