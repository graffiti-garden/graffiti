import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { Ref } from "vue";
import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";

export const parallaxOrProvenance: "Parallax" | "Provenance" =
  window.location.origin.includes("provenance") ? "Provenance" : "Parallax";

const chatAdminCache = new Map<string, string>();
const chatAdminLoading = new Map<string, Promise<string>>();

async function findChatAdmin(channel: string, session: GraffitiSession) {
  const cached = chatAdminCache.get(channel);
  if (cached !== undefined) return cached;

  const existing = chatAdminLoading.get(channel);
  if (existing) return existing;

  const loading = (async () => {
    let admin = "";
    let published: number | undefined;

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
      if (result.error || result.tombstone) continue;

      const object = result.object;
      if (published === undefined || object.value.published < published) {
        published = object.value.published;
        admin = object.actor;
      }
    }

    chatAdminCache.set(channel, admin);
    return admin;
  })();

  chatAdminLoading.set(channel, loading);
  try {
    return await loading;
  } finally {
    chatAdminLoading.delete(channel);
  }
}

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
        chatAdmin.value = await findChatAdmin(channel, session);
      }
    },
    { immediate: true },
  );

  return chatAdmin;
}
