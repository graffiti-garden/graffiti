import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import type { MaybeRefOrGetter } from "vue";
import { ref, toValue, watch } from "vue";

export function useResolveString(
  input: MaybeRefOrGetter<string>,
  resolve: (input: string) => Promise<string>,
) {
  const output = ref<string | null | undefined>(undefined);

  watch(
    () => toValue(input),
    async (input, _prev, onInvalidate) => {
      let active = true;
      onInvalidate(() => {
        active = false;
      });

      output.value = undefined;

      try {
        const resolved = await resolve(input);
        if (active) output.value = resolved;
      } catch (err) {
        if (!active) return;

        if (err instanceof GraffitiErrorNotFound) {
          output.value = null;
        } else {
          console.error(err);
        }
      }
    },
    { immediate: true },
  );

  return {
    output,
  };
}

export function displayOutput(output: string | null | undefined) {
  if (output === undefined) return "Loading...";
  if (output === null) return "Not found";
  return output;
}
