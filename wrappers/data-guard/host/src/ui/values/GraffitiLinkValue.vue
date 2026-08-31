<script setup lang="ts">
import type { GraffitiMedia, GraffitiObject } from "@graffiti-garden/api";
import {
  GraffitiActorToHandle,
  useGraffiti,
} from "@graffiti-garden/wrapper-vue";
import { computed, ref, watch } from "vue";
import ObjectValue from "../prompts/ObjectValue.vue";
import { mediaLabels } from "../media.js";
import MediaView from "../prompts/MediaView.vue";
import ValueBubble from "./ValueBubble.vue";

const props = withDefaults(defineProps<{ url: string; lazy?: boolean }>(), {
  lazy: false,
});
const graffiti = useGraffiti();
const schema = {} as const;
const accept = { types: ["*/*"] };
const media = ref<GraffitiMedia>();
const object = ref<GraffitiObject<{}>>();
const resolved = ref(false);
const active = ref(!props.lazy);

const emoji = computed(() =>
  media.value ? "📎" : object.value ? "🎨" : "🔗",
);

watch(
  [() => props.url, active],
  async ([url, shouldLoad], _, cleanup) => {
    let current = true;
    cleanup(() => (current = false));
    media.value = undefined;
    object.value = undefined;
    resolved.value = false;
    if (!shouldLoad) return;

    // Graffiti URLs do not encode their resource kind. Probe media first, then
    // fall back to structured data on any media error.
    try {
      const value = await graffiti.getMedia(url, accept);
      if (!current) return;
      media.value = value;
      resolved.value = true;
      return;
    } catch {
      if (!current) return;
    }

    try {
      const value = await graffiti.get(url, schema);
      if (current) object.value = value;
    } catch {
      // The neutral unavailable state covers links that resolve as neither.
    } finally {
      if (current) resolved.value = true;
    }
  },
  { immediate: true },
);

function label(media: any) {
  const item = mediaLabels(media?.data?.type).item;
  return item[0].toUpperCase() + item.slice(1);
}
</script>

<template>
  <ValueBubble
    :emoji="emoji"
    @update:pinned="active = active || $event"
  >
    <GraffitiActorToHandle v-if="media" v-slot="{ handle }" :actor="media.actor">
      <span class="label">{{ label(media) }} by {{ handle ?? "Identity" }}</span>
    </GraffitiActorToHandle>
    <GraffitiActorToHandle v-else-if="object" v-slot="{ handle }" :actor="object.actor">
      <span class="label">Data by {{ handle ?? "Identity" }}</span>
    </GraffitiActorToHandle>
    <span v-else class="label">
      {{ !active ? "View item" : resolved ? "Data unavailable" : "Loading…" }}
    </span>
    <template #details="{ pinned }">
      <div v-if="pinned && media" class="graffiti-data">
        <MediaView
          :media="media"
          :description="mediaLabels(media.data.type).description"
        />
      </div>
      <div v-else-if="pinned && object" class="graffiti-data">
        <ObjectValue :value="object.value" />
      </div>
      <span v-else-if="!active">Click to load this item</span>
      <span v-else-if="!resolved">Loading preview…</span>
      <span v-else-if="!media && !object">This item is unavailable</span>
      <span v-else>Click to view</span>
    </template>
  </ValueBubble>
</template>

<style scoped>
.graffiti-data { width: min(30rem, calc(100vw - 3rem)); }
</style>
