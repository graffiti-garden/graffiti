import type { MaybeRefOrGetter } from "vue";
import { useGraffiti } from "../globals";
import { useResolveString } from "./resolve-string";

export function useGraffitiActorToHandle(actor: MaybeRefOrGetter<string>) {
  const graffiti = useGraffiti();
  const { output } = useResolveString(
    actor,
    graffiti.actorToHandle.bind(graffiti),
  );
  return { handle: output };
}
