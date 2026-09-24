import type { MaybeRefOrGetter } from "vue";
import { useGraffiti } from "../globals";
import { useResolveString } from "./resolve-string";

/**
 * The [Graffiti.handleToActor](https://api.graffiti.garden/classes/Graffiti.html#handletoactor)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiHandleToActor}.
 *
 * The arguments of this composable are the same as Graffiti.handleToActor,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 *
 * @returns
 * - `actor`: A [ref](https://vuejs.org/api/reactivity-core.html#ref) containing
 * the retrieved actor, `undefined` while loading, or `null` if not found or the lookup fails.
 * - `error`: A ref containing the lookup error for failures other than not found,
 * or `null` otherwise.
 */
export function useGraffitiHandleToActor(handle: MaybeRefOrGetter<string>) {
  const graffiti = useGraffiti();
  const { output, error } = useResolveString(
    handle,
    graffiti.handleToActor.bind(graffiti),
  );
  return { actor: output, error };
}
