<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffitiGetMedia } from "@graffiti-garden/wrapper-vue";
import { computed } from "vue";
import type { MessageAttachment } from "../model.js";

const props = defineProps<{
  attachment: MessageAttachment;
  session?: GraffitiSession;
}>();
const accept = computed(() => ({ types: [props.attachment.mediaType] }));
const { media } = useGraffitiGetMedia(
  () => props.attachment.url,
  accept,
  () => props.session,
);
const kind = computed(() => props.attachment.mediaType.split("/")[0]);
</script>

<template>
  <section class="attachment" aria-label="Attachment">
    <p v-if="media === undefined" aria-busy="true">Loading attachment…</p>
    <p v-else-if="media === null">Attachment unavailable.</p>
    <template v-else>
      <img
        v-if="kind === 'image'"
        :src="media.dataUrl"
        :alt="attachment.name"
      />
      <audio v-else-if="kind === 'audio'" :src="media.dataUrl" controls />
      <video v-else-if="kind === 'video'" :src="media.dataUrl" controls />
      <a :href="media.dataUrl" :download="attachment.name">
        {{ attachment.name }}
      </a>
      <small>{{ Math.ceil(attachment.size / 1024) }} KB</small>
    </template>
  </section>
</template>
