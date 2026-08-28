<script setup lang="ts">
import { computed } from "vue";
import type { Request } from "../../core/db.js";
import { formatBytes, mediaLabels } from "../media.js";
import IdentityValue from "../values/IdentityValue.vue";
import LinkValue from "../values/LinkValue.vue";
import MediaView from "./MediaView.vue";
import DetailList from "./shared/DetailList.vue";
import PromptBody from "./shared/PromptBody.vue";

const props = defineProps<{
  request: Request;
  canRemember: boolean;
  resolve: (answer: any) => void;
  preview?: any;
  action: "store" | "access" | "delete";
}>();

const media = computed(() => props.request.subject as any);
const labels = computed(() => mediaLabels(media.value.type));
const creator = computed(() =>
  media.value.actor ??
  (props.request.method === "postMedia" ? props.request.actor : undefined),
);
const title = computed(
  () =>
    `Allow this site to ${props.action} this ${
      props.action === "access" ? "private " : ""
    }${labels.value.item}?`,
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
  >
    <template #summary>
      <span>asks to {{ action }}:</span>
      <MediaView
        :media="preview?.media"
        :name="media.name"
        :description="labels.description"
      />
    </template>
    <template #details>
      <DetailList>
        <dt>Kind</dt><dd>{{ labels.item }}</dd>
        <dt>MIME type</dt><dd><code>{{ media.type }}</code></dd>
        <template v-if="media.name"><dt>Name</dt><dd>{{ media.name }}</dd></template>
        <dt>Size</dt><dd>{{ formatBytes(media.size) }}</dd>
        <template v-if="creator">
          <dt>Creator</dt>
          <dd><IdentityValue :actor="creator" /></dd>
        </template>
        <dt>Visibility</dt>
        <dd v-if="media.allowed == null"><em>Anyone with a link to the file</em></dd>
        <dd v-else-if="media.allowed.length === 0"><em>Only you</em></dd>
        <dd v-else><ul class="actors"><li v-for="actor in media.allowed" :key="actor"><IdentityValue :actor="actor" /></li></ul></dd>
        <template v-if="media.url"><dt>URL</dt><dd><LinkValue :url="media.url" /></dd></template>
      </DetailList>
    </template>
  </PromptBody>
</template>

<style scoped>
.actors { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
code { word-break: break-all; }
</style>
