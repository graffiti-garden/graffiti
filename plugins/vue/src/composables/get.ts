import type {
  GraffitiObject,
  GraffitiObjectUrl,
  GraffitiObjectStreamContinueEntry,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import type { MaybeRefOrGetter, Ref } from "vue";
import { ref, toValue, watch, onScopeDispose } from "vue";
import { useGraffitiSynchronize } from "../globals";

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
