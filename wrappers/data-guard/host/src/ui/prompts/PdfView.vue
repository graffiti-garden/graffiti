<script setup lang="ts">
import {
  getDocument,
  GlobalWorkerOptions,
  RenderingCancelledException,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { nextTick, ref, watch } from "vue";

GlobalWorkerOptions.workerSrc = workerUrl;

const props = defineProps<{
  media?: any;
  url: string;
  name: string;
}>();

const canvas = ref<HTMLCanvasElement>();
const pageNumber = ref(1);
const pageCount = ref(0);
const loading = ref(true);
const error = ref("");

let pdf: any;
let rendering: any;
let renderId = 0;

watch(
  () => props.media?.data,
  async (data, _, cleanup) => {
    let loadingTask: ReturnType<typeof getDocument> | undefined;
    let active = true;
    cleanup(() => {
      active = false;
      rendering?.cancel();
      void loadingTask?.destroy();
    });

    pdf = undefined;
    rendering?.cancel();
    renderId++;
    pageCount.value = 0;
    pageNumber.value = 1;
    error.value = "";
    loading.value = true;
    if (!(data instanceof Blob)) return;

    try {
      const bytes = await data.arrayBuffer();
      if (!active) return;
      loadingTask = getDocument({ data: new Uint8Array(bytes) });
      const loaded = await loadingTask.promise;
      if (!active) return;
      pdf = loaded;
      pageCount.value = loaded.numPages;
      await renderPage();
    } catch (cause) {
      if (active) {
        error.value = cause instanceof Error ? cause.message : "Unable to display PDF.";
      }
    } finally {
      if (active) loading.value = false;
    }
  },
  { immediate: true },
);

watch(pageNumber, () => void renderPage());

async function renderPage() {
  if (!pdf || !canvas.value || !pageCount.value) {
    await nextTick();
  }
  if (!pdf || !canvas.value || !pageCount.value) return;

  const id = ++renderId;
  rendering?.cancel();
  try {
    const page = await pdf.getPage(pageNumber.value);
    if (id !== renderId) return;
    const viewport = page.getViewport({ scale: 1.25 });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const target = canvas.value;
    target.width = Math.floor(viewport.width * outputScale);
    target.height = Math.floor(viewport.height * outputScale);
    target.style.width = `${Math.floor(viewport.width)}px`;
    target.style.height = `${Math.floor(viewport.height)}px`;
    rendering = page.render({
      canvas: target,
      viewport,
      transform:
        outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    });
    await rendering.promise;
  } catch (cause) {
    if (!(cause instanceof RenderingCancelledException)) {
      error.value = cause instanceof Error ? cause.message : "Unable to display PDF.";
    }
  }
}
</script>

<template>
  <div class="pdf-viewer">
    <em v-if="loading">Loading PDF...</em>
    <template v-else-if="error">
      <em>{{ error }}</em>
      <a :href="url" :download="name">Download {{ name }}</a>
    </template>
    <canvas ref="canvas" :hidden="loading || Boolean(error)" />
    <nav v-if="!loading && !error && pageCount > 1" aria-label="PDF pages">
      <button type="button" :disabled="pageNumber === 1" @click="pageNumber--">
        Previous
      </button>
      <span>Page {{ pageNumber }} of {{ pageCount }}</span>
      <button
        type="button"
        :disabled="pageNumber === pageCount"
        @click="pageNumber++"
      >
        Next
      </button>
    </nav>
  </div>
</template>

<style scoped>
.pdf-viewer { display: flex; width: 100%; gap: 0.6rem; margin-top: 0.5rem; flex-direction: column; align-items: center; }
canvas { display: block; max-width: 100%; height: auto !important; border: 1px solid var(--border-color); border-radius: 0.4rem; background: white; }
nav { display: flex; align-items: center; justify-content: center; gap: 0.75rem; font-size: 1rem; }
</style>
