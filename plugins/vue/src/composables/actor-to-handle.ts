import type { MaybeRefOrGetter } from "vue";
import { useGraffiti } from "../globals";
import { useResolveString } from "./resolve-string";

/**
 * The [Graffiti.actorToHandle](https://api.graffiti.garden/classes/Graffiti.html#actortohandle)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiActorToHandle}.
 *
 * The arguments of this composable are the same as Graffiti.actorToHandle,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 *
 * @returns
 * - `handle`: A [ref](https://vuejs.org/api/reactivity-core.html#ref) that contains
 * the retrieved handle, if it exists. If the handle cannot be found, the result
 * is `null`. If the handle is still being fetched, the result is `undefined`.
 */
export function useGraffitiActorToHandle(actor: MaybeRefOrGetter<string>) {
  const graffiti = useGraffiti();
  const { output } = useResolveString(
    actor,
    graffiti.actorToHandle.bind(graffiti),
  );
  return { handle: output };
}
