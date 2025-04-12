import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti, useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import type { Ref } from "vue";
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";

export const parallaxOrProvenance: "Parallax" | "Provenance" =
  window.location.origin.includes("provenance") ? "Provenance" : "Parallax";

const chatAdminLoading = new Map<string, boolean>();
const chatAdminCache = new Map<string, string>();
export function chatAdmin(
  channel: MaybeRefOrGetter<string>,
  session: MaybeRefOrGetter<GraffitiSession>,
): Ref<string> {
  const chatAdmin = ref("");
  watch(
    [channel, session] as const,
    async ([channelRef, sessionRef]) => {
      const channel = toValue(channelRef);
      const session = toValue(sessionRef);
      if (!channel) return;

      if (parallaxOrProvenance === "Parallax") {
        chatAdmin.value = session.actor;
      } else {
        const cached = chatAdminCache.get(channel);
        if (cached) {
          chatAdmin.value = cached;
          return;
        }

        const loading = chatAdminLoading.get(channel);
        if (loading) return; // Someone else will do it

        chatAdminLoading.set(channel, true);

        let admin: undefined | string;
        let published: undefined | number;
        for await (const result of useGraffiti().discover(
          [channel],
          {
            properties: {
              value: {
                required: ["published"],
                properties: {
                  published: { type: "number" },
                },
              },
            },
          } as const,
          session,
        )) {
          if (result.error) continue;

          const object = result.object;
          if (object.value.published > (published ?? 0)) {
            published = object.value.published;
            admin = object.actor;
          }
        }

        chatAdminLoading.delete(channel);
        chatAdminCache.set(channel, admin ?? "");
        chatAdmin.value = admin ?? "";
      }
    },
    { immediate: true },
  );

  return chatAdmin;
}
