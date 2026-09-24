import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import type { MaybeRefOrGetter } from "vue";
import { ref, toValue, watch } from "vue";

export function useResolveString(
  input: MaybeRefOrGetter<string | null | undefined>,
  resolve: (input: string) => Promise<string>,
) {
  const output = ref<string | null | undefined>(undefined);
  const error = ref<Error | null>(null);

  watch(
    () => toValue(input),
    async (input, _prev, onInvalidate) => {
      let active = true;
      onInvalidate(() => {
        active = false;
      });
      error.value = null;
      if (!input) {
        output.value = input;
        return;
      }

      output.value = undefined;

      try {
        const resolved = await resolve(input);
        if (active) output.value = resolved;
      } catch (err) {
        if (!active) return;

        output.value = null;
        if (
          !(
            err instanceof GraffitiErrorNotFound ||
            (err instanceof Error && err.name === "GraffitiErrorNotFound")
          )
        ) {
          error.value = err instanceof Error ? err : new Error(String(err));
        }
      }
    },
    { immediate: true },
  );

  return {
    output,
    error,
  };
}

export function displayOutput(output: string | null | undefined) {
  if (output === undefined) return "Loading...";
  if (output === null) return "Not found";
  return output;
}
