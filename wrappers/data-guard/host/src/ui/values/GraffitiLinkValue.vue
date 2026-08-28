<script setup lang="ts">
import type { GraffitiMedia, GraffitiObject } from "@graffiti-garden/api";
import {
  GraffitiActorToHandle,
  useGraffiti,
} from "@graffiti-garden/wrapper-vue";
import { ref, watch } from "vue";
import ObjectValue from "../prompts/ObjectValue.vue";
import { mediaLabels } from "../media.js";
import MediaView from "../prompts/MediaView.vue";
import ValueBubble from "./ValueBubble.vue";

const props = defineProps<{ url: string }>();
const graffiti = useGraffiti();
const schema = {} as const;
const accept = { types: ["*/*"] };
const media = ref<GraffitiMedia>();
const object = ref<GraffitiObject<{}>>();
const resolved = ref(false);

watch(
  () => props.url,
  async (url, _, cleanup) => {
    let active = true;
    cleanup(() => (active = false));
    media.value = undefined;
    object.value = undefined;
    resolved.value = false;

    // Graffiti URLs do not encode their resource kind. Probe media first, then
    // fall back to structured data on any media error.
    try {
      const value = await graffiti.getMedia(url, accept);
      if (!active) return;
      media.value = value;
      resolved.value = true;
      return;
    } catch {
      if (!active) return;
    }

    try {
      const value = await graffiti.get(url, schema);
      if (active) object.value = value;
    } catch {
      // The neutral unavailable state covers links that resolve as neither.
    } finally {
      if (active) resolved.value = true;
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
  <ValueBubble v-if="media" emoji="📎">
    <GraffitiActorToHandle v-slot="{ handle }" :actor="media.actor">
      <span class="label">{{ label(media) }} by {{ handle ?? "Identity" }}</span>
    </GraffitiActorToHandle>
    <template #details="{ pinned }">
      <div v-if="pinned" class="graffiti-data">
        <MediaView
          :media="media"
          :description="mediaLabels(media.data.type).description"
        />
      </div>
      <span v-else>Click to view media</span>
    </template>
  </ValueBubble>
  <ValueBubble v-else-if="object" emoji="🎨">
    <GraffitiActorToHandle v-slot="{ handle }" :actor="object.actor">
      <span class="label">Data by {{ handle ?? "Identity" }}</span>
    </GraffitiActorToHandle>
    <template #details="{ pinned }">
      <div v-if="pinned" class="graffiti-data">
        <ObjectValue :value="object.value" />
      </div>
      <span v-else>Click to view data</span>
    </template>
  </ValueBubble>
  <ValueBubble v-else emoji="🔗">
    <span class="label">{{ resolved ? "Data unavailable" : "Resolving…" }}</span>
  </ValueBubble>
</template>

<style scoped>
.graffiti-data { width: min(30rem, calc(100vw - 3rem)); }
</style>
