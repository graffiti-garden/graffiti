<script setup lang="ts">
import {
  GraffitiActorToHandle,
  GraffitiGetMedia,
} from "@graffiti-garden/wrapper-vue";
import { computed } from "vue";
import type { Request } from "../../core/db.js";
import { formatBytes, mediaLabels } from "../media.js";
import MediaView from "./MediaView.vue";
import PromptBody from "./shared/PromptBody.vue";

const props = defineProps<{
  request: Request;
  canRemember: boolean;
  resolve: (answer: any) => void;
  preview?: any;
  action: "store" | "get" | "delete";
}>();

const media = computed(() => props.request.subject as any);
const labels = computed(() => mediaLabels(media.value.type));
const creator = computed(() =>
  media.value.actor ??
  (props.request.method === "postMedia" ? props.request.actor : undefined),
);
const title = computed(
  () => `Allow this site to ${props.action} this ${labels.value.item}?`,
);
</script>

<template>
  <PromptBody
    :request="request"
    :can-remember="canRemember"
    :resolve="resolve"
    :title="title"
    summary=""
    :remember-label="labels.remember"
    :allowed="Array.isArray(media.allowed)"
  >
    <template #summary>
      <span>wants to {{ action }}:</span>
      <div v-if="preview?.url" class="media-preview">
        <GraffitiGetMedia
          v-slot="{ media: fetchedMedia }"
          :url="preview.url"
          :accept="preview.accept"
          :session="preview.session"
        >
          <MediaView
            :media="fetchedMedia"
            :name="media.name"
            :description="labels.description"
          />
        </GraffitiGetMedia>
      </div>
      <MediaView
        v-else
        :media="preview?.media"
        :name="media.name"
        :description="labels.description"
      />
    </template>
    <template #details>
      <dl @click.stop>
        <dt>Kind</dt><dd>{{ labels.item }}</dd>
        <dt>MIME type</dt><dd><code>{{ media.type }}</code></dd>
        <template v-if="media.name"><dt>Name</dt><dd>{{ media.name }}</dd></template>
        <dt>Size</dt><dd>{{ formatBytes(media.size) }}</dd>
        <template v-if="creator">
          <dt>Creator</dt>
          <dd><GraffitiActorToHandle :actor="creator" /></dd>
        </template>
        <dt>Visibility</dt>
        <dd v-if="media.allowed == null"><em>Anyone with a link to the file</em></dd>
        <dd v-else-if="media.allowed.length === 0"><em>Only you</em></dd>
        <dd v-else><ul><li v-for="actor in media.allowed" :key="actor"><code>{{ actor }}</code></li></ul></dd>
        <template v-if="media.url"><dt>URL</dt><dd><code>{{ media.url }}</code></dd></template>
      </dl>
    </template>
  </PromptBody>
</template>

<style scoped>
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; margin: 0; }
dt { font-weight: 600; } dd { min-width: 0; margin: 0; overflow-wrap: anywhere; } ul { margin: 0; padding-left: 1.2rem; } code { word-break: break-all; }
.media-preview { width: 100%; }
:deep(img) { display: block; width: auto; max-width: 100%; height: auto; max-height: min(45dvh, 22rem); margin: 0.5rem auto 0; border: 1px solid var(--border-color); border-radius: 0.4rem; object-fit: contain; }
:deep(video) { display: block; width: 100%; max-height: min(45dvh, 22rem); margin-top: 0.5rem; object-fit: contain; }
:deep(audio) { display: block; width: 100%; margin-top: 0.5rem; }
</style>
