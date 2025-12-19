import type {
  GraffitiMedia,
  GraffitiMediaRequirements,
  GraffitiObject,
  GraffitiObjectStreamContinue,
  GraffitiObjectStreamContinueEntry,
  GraffitiObjectStreamError,
  GraffitiObjectStreamReturn,
  GraffitiObjectUrl,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { useGraffitiSynchronize } from "./globals";
import { onScopeDispose } from "vue";

/**
 * The [Graffiti.get](https://api.graffiti.garden/classes/Graffiti.html#get)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiGet}.
 *
 * The arguments of this composable as the same as Graffiti.get,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 *
 * @returns:
 * - `object`: A [ref](https://vuejs.org/api/reactivity-core.html#ref) that contains
 * the retrieved Graffiti object, if it exists. If the object has been deleted,
 * the result is `null`. If the object is still being fetched, the result is `undefined`.
 * - `poll`: A function that can be called to manually refresh the object.
 */
export function useGraffitiGet<Schema extends JSONSchema>(
  url: MaybeRefOrGetter<GraffitiObjectUrl | string>,
  schema: MaybeRefOrGetter<Schema>,
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
): {
  object: Ref<GraffitiObject<Schema> | null | undefined>;
  poll: () => Promise<void>;
} {
  const graffiti = useGraffitiSynchronize();

  const object: Ref<GraffitiObject<Schema> | null | undefined> = ref(undefined);
  let poll_ = async () => {};
  const poll = async () => poll_();

  let iterator: AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>>;
  onScopeDispose(() => {
    iterator?.return(null);
  });

  watch(
    () => [toValue(url), toValue(schema), toValue(session)] as const,
    (args, _prev, onInvalidate) => {
      // Reset the object value (undefined = "loading")
      object.value = undefined;

      // Initialize a new iterator
      const myIterator = graffiti.synchronizeGet<Schema>(...args);
      iterator = myIterator;

      // Make sure to dispose of the iterator when invalidated
      let active = true;
      onInvalidate(() => {
        active = false;
        myIterator.return(null);
      });

      // Listen to the iterator in the background,
      // it will receive results from polling below
      (async () => {
        for await (const result of myIterator) {
          if (!active) return;
          if (result.tombstone) {
            object.value = null;
          } else {
            object.value = result.object;
          }
        }
      })();

      // Then set up a polling function
      let polling = false;
      poll_ = async () => {
        if (polling || !active) return;
        polling = true;
        try {
          await graffiti.get<Schema>(...args);
        } catch (e) {
          if (!(e instanceof GraffitiErrorNotFound)) {
            console.error(e);
          }
        } finally {
          polling = false;
        }
      };
      poll();
    },
    { immediate: true },
  );

  return {
    object,
    poll,
  };
}

export function useGraffitiGetMedia(
  url: MaybeRefOrGetter<string>,
  requirements: MaybeRefOrGetter<GraffitiMediaRequirements>,
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
): {
  media: Ref<(GraffitiMedia & { dataUrl: string }) | null | undefined>;
  poll: () => Promise<void>;
} {
  const graffiti = useGraffitiSynchronize();
  const media = ref<(GraffitiMedia & { dataUrl: string }) | null | undefined>(
    undefined,
  );

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
  watch(
    () => ({
      args: [toValue(url), toValue(requirements), toValue(session)] as const,
      pollCounter: pollCounter.value,
    }),
    async ({ args }, _prev, onInvalidate) => {
      // Revoke the data URL to prevent a memory leak
      if (media.value?.dataUrl) {
        URL.revokeObjectURL(media.value.dataUrl);
      }
      media.value = undefined;

      let active = true;
      onInvalidate(() => {
        active = false;
      });

      try {
        const { data, actor, allowed } = await graffiti.getMedia(...args);
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
        if (e instanceof GraffitiErrorNotFound) {
          media.value = null;
        } else {
          console.error(e);
        }
      } finally {
        resolvePoll();
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
    poll,
  };
}

/**
 * The [Graffiti.discover](https://api.graffiti.garden/classes/Graffiti.html#discover)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiDiscover}.
 *
 * The arguments of this composable as the same as Graffiti.discover,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 *
 * @returns
 * - `objects`: A [ref](https://vuejs.org/api/reactivity-core.html#ref) that contains
 * an array of Graffiti objects.
 * - `poll`: A function that can be called to manually check for for objects.
 * - `isFirstPoll`: A boolean [ref](https://vuejs.org/api/reactivity-core.html#ref)
 * that indicates if the *first* poll after a change of arguments is currently running.
 * Useful to show a loading spinner or disable a button.
 */
export function useGraffitiDiscover<Schema extends JSONSchema>(
  channels: MaybeRefOrGetter<string[]>,
  schema: MaybeRefOrGetter<Schema>,
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
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
  let syncIterator: AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>>;
  let discoverIterator: GraffitiObjectStreamContinue<Schema>;

  onScopeDispose(() => {
    syncIterator?.return(null);
    discoverIterator?.return({
      continue: () => discoverIterator,
      cursor: "",
    });
  });

  const refresh = ref(0);
  function restartWatch(timeout = 0) {
    setTimeout(() => {
      refresh.value++;
    }, timeout);
  }
  watch(
    () => ({
      args: [toValue(channels), toValue(schema), toValue(session)] as const,
      refresh: refresh.value,
    }),
    ({ args }, _prev, onInvalidate) => {
      // Reset the output
      objectsRaw.clear();
      objects.value = [];
      isFirstPoll.value = true;

      // Initialize new iterators
      const mySyncIterator = graffiti.synchronizeDiscover<Schema>(...args);
      syncIterator = mySyncIterator;
      let myDiscoverIterator: GraffitiObjectStreamContinue<Schema>;

      // Set up automatic iterator cleanup
      let active = true;
      onInvalidate(() => {
        active = false;
        mySyncIterator.return(null);
        myDiscoverIterator?.return({
          continue: () => discoverIterator,
          cursor: "",
        });
      });

      // Start to synchronize in the background
      // (all polling results will go through here)
      let batchFlattenTimer: ReturnType<typeof setTimeout> | undefined =
        undefined;
      (async () => {
        for await (const result of mySyncIterator) {
          if (!active) break;
          if (result.tombstone) {
            objectsRaw.delete(result.object.url);
          } else {
            objectsRaw.set(result.object.url, result.object);
          }
          if (!batchFlattenTimer) {
            batchFlattenTimer = setTimeout(() => {
              if (!active) return;
              objects.value = Array.from(objectsRaw.values());
              batchFlattenTimer = undefined;
            }, 0);
          }
        }
      })();

      // Then set up a polling function
      let polling = false;
      let continueFn: GraffitiObjectStreamReturn<Schema>["continue"] = () =>
        graffiti.discover<Schema>(...args);
      poll_ = async () => {
        if (polling || !active) return;
        polling = true;

        // Try to start the iterator
        try {
          myDiscoverIterator = continueFn(args[2]);
        } catch (e) {
          // Discovery is lazy so this should not happen,
          // wait a bit before retrying
          return restartWatch(5000);
        }
        if (!active) return;
        discoverIterator = myDiscoverIterator;

        while (true) {
          let result: IteratorResult<
            | GraffitiObjectStreamContinueEntry<Schema>
            | GraffitiObjectStreamError,
            GraffitiObjectStreamReturn<Schema>
          >;
          try {
            result = await myDiscoverIterator.next();
          } catch (e) {
            if (e instanceof GraffitiErrorNotFound) {
              // The cursor has expired, we need to start from scratch.
              return restartWatch();
            } else {
              // If something else went wrong, wait a bit before retrying
              return restartWatch(5000);
            }
          }
          if (!active) return;
          if (result.done) {
            continueFn = result.value.continue;
            break;
          } else if (result.value.error) {
            // Non-fatal errors do not stop the stream
            console.error(result.value.error);
          }
        }
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
