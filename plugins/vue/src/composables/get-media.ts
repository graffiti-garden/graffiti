import type {
  GraffitiMedia,
  GraffitiMediaAccept,
  GraffitiSession,
} from "@graffiti-garden/api";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import type { MaybeRefOrGetter, Ref } from "vue";
import { ref, toValue, watch, onScopeDispose } from "vue";
import { useGraffitiSynchronize } from "../globals";

/**
 * The [Graffiti.getMedia](https://api.graffiti.garden/classes/Graffiti.html#getMedia)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiGetMedia}.
 *
 * The arguments of this composable are the same as Graffiti.getMedia,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 *
 * @returns
 * - `media`: A [ref](https://vuejs.org/api/reactivity-core.html#ref) containing
 * the retrieved media, `undefined` while loading, or `null` if not found or the fetch fails.
 * Retrieved media includes a `dataUrl` for display in a template.
 * - `error`: A ref containing the fetch error for failures other than not found,
 * or `null` otherwise.
 * - `poll`: A function that can be called to manually check if the media has changed.
 */
export function useGraffitiGetMedia(
  url: MaybeRefOrGetter<string>,
  accept: MaybeRefOrGetter<GraffitiMediaAccept>,
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
): {
  media: Ref<(GraffitiMedia & { dataUrl: string }) | null | undefined>;
  error: Ref<Error | null>;
  poll: () => Promise<void>;
} {
  const graffiti = useGraffitiSynchronize();
  const media = ref<(GraffitiMedia & { dataUrl: string }) | null | undefined>(
    undefined,
  );
  const error = ref<Error | null>(null);

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

  const args_ = () =>
    [toValue(url), toValue(accept), toValue(session)] as const;

  watch(
    () => `${pollCounter.value}:${JSON.stringify(args_())}`,
    async (_, __, onInvalidate) => {
      const args = args_();

      // Revoke the data URL to prevent a memory leak
      if (media.value?.dataUrl) {
        URL.revokeObjectURL(media.value.dataUrl);
      }
      media.value = undefined;
      error.value = null;

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
        if (
          !(
            e instanceof GraffitiErrorNotFound ||
            (e instanceof Error && e.name === "GraffitiErrorNotFound")
          )
        ) {
          error.value = e instanceof Error ? e : new Error(String(e));
        }
        media.value = null;
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
    error,
    poll,
  };
}
