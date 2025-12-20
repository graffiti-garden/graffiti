import type {
  GraffitiMedia,
  GraffitiMediaRequirements,
  GraffitiSession,
} from "@graffiti-garden/api";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import type { MaybeRefOrGetter, Ref } from "vue";
import { ref, toValue, watch, onScopeDispose } from "vue";
import { useGraffitiSynchronize } from "../globals";

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
