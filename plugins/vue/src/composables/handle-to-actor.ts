import type { MaybeRefOrGetter } from "vue";
import { useGraffiti } from "../globals";
import { useResolveString } from "./resolve-string";

export function useGraffitiHandleToActor(handle: MaybeRefOrGetter<string>) {
  const graffiti = useGraffiti();
  const { output } = useResolveString(
    handle,
    graffiti.handleToActor.bind(graffiti),
  );
  return { actor: output };
}
