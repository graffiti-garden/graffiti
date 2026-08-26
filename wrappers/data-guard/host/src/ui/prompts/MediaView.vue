<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{ media?: any }>();
const url = ref("");
const type = computed(() => props.media?.data?.type ?? "");

watch(
  () => props.media,
  (media, _, cleanup) => {
    url.value = media?.dataUrl ?? "";
    if (!url.value && media?.data instanceof Blob) {
      const objectUrl = URL.createObjectURL(media.data);
      url.value = objectUrl;
      cleanup(() => URL.revokeObjectURL(objectUrl));
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="media" @click.stop @keydown.stop>
    <img v-if="url && type.startsWith('image/')" :src="url" alt="Media preview" />
    <video v-else-if="url && type.startsWith('video/')" :src="url" controls />
    <audio v-else-if="url && type.startsWith('audio/')" :src="url" controls preload="metadata" />
    <iframe v-else-if="url" :src="url" sandbox="" title="Media preview" />
    <em v-else>Media unavailable</em>
  </div>
</template>

<style scoped>
.media { display: flex; width: 100%; margin-top: 0.5rem; flex-direction: column; align-items: center; }
img { display: block; width: auto; max-width: 100%; height: auto; max-height: min(45dvh, 22rem); border: 1px solid var(--border-color); border-radius: 0.4rem; background: var(--background-color); object-fit: contain; }
video { display: block; width: 100%; max-height: min(45dvh, 22rem); border: 1px solid var(--border-color); border-radius: 0.4rem; background: var(--background-color); object-fit: contain; }
audio { display: block; width: 100%; }
iframe { display: block; width: 100%; height: min(45dvh, 22rem); border: 1px solid var(--border-color); border-radius: 0.4rem; background: var(--background-color); }
</style>
