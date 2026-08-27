<script setup lang="ts">
import { mimeData } from "human-filetypes";
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { formatBytes } from "../media.js";

const PdfView = defineAsyncComponent(() => import("./PdfView.vue"));

const props = defineProps<{
  media?: any;
  name?: string;
  description?: string;
}>();
const url = ref("");
const type = computed(() => props.media?.data?.type ?? "");
const filename = computed(
  () =>
    props.name ||
    props.media?.data?.name ||
    `download${mimeData[type.value]?.extensions?.[0] ?? ""}`,
);
const size = computed(() => props.media?.data?.size);

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
  <div
    class="media"
    :class="{ image: url && type.startsWith('image/') }"
    @click.stop
    @keydown.stop
  >
    <img v-if="url && type.startsWith('image/')" :src="url" alt="Media preview" />
    <video v-else-if="url && type.startsWith('video/')" :src="url" controls />
    <audio v-else-if="url && type.startsWith('audio/')" :src="url" controls preload="metadata" />
    <iframe v-else-if="url && type.startsWith('text/')" :src="url" sandbox="" title="Text preview" />
    <PdfView
      v-else-if="url && type.startsWith('application/pdf')"
      :media="media"
      :url="url"
      :name="filename"
    />
    <a v-else-if="url" class="download" :href="url" :download="filename">
      <span class="download-title">
        <strong>{{ description || 'File' }}</strong>
        <span v-if="typeof size === 'number'" class="download-size">
          ({{ formatBytes(size) }})
        </span>
      </span>
      <span class="download-action">Click to download</span>
    </a>
    <em v-else-if="media === null">Media not found</em>
    <em v-else>Media loading...</em>
  </div>
</template>

<style scoped>
.media { display: flex; width: 100%; margin-top: 0.5rem; flex-direction: column; align-items: center; cursor: default; }
.media.image { width: fit-content; max-width: 100%; margin-right: auto; margin-left: auto; }
img { display: block; width: auto; max-width: 100%; height: auto; max-height: min(45dvh, 22rem); border: 1px solid var(--border-color); border-radius: 0.4rem; background: var(--background-color); object-fit: contain; }
video { display: block; width: 100%; max-height: min(45dvh, 22rem); border: 1px solid var(--border-color); border-radius: 0.4rem; background: var(--background-color); object-fit: contain; }
audio { display: block; width: 100%; }
iframe { display: block; width: 100%; height: min(45dvh, 22rem); border: 1px solid var(--border-color); border-radius: 0.4rem; background: white; }
.download { display: flex; width: 100%; box-sizing: border-box; align-items: center; gap: 0.25rem; padding: 0.8rem 1rem; border: 1px solid var(--border-color); border-radius: 0.5rem; flex-direction: column; color: inherit; background: var(--background-color); text-align: center; text-decoration: none; }
.download:hover { border-color: var(--accent-button-background); background: color-mix(in srgb, var(--accent-button-background) 8%, var(--background-color)); }
.download-title { font-size: 1.1em; text-transform: capitalize; }
.download-size { margin-left: 0.2em; opacity: 0.65; font-size: 0.85em; text-transform: none; }
.download-action { color: var(--link-color); font-weight: normal; }
.download:hover .download-action { color: var(--link-hover-color); }
</style>
