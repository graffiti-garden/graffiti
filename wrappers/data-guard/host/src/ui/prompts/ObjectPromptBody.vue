<script setup lang="ts">
import { computed } from "vue";
import type { Request } from "../../core/db.js";
import IdentityValue from "../values/IdentityValue.vue";
import LinkValue from "../values/LinkValue.vue";
import StructuredValue from "../values/StructuredValue.vue";
import ObjectValue from "./ObjectValue.vue";
import DetailList from "./shared/DetailList.vue";
import PromptBody from "./shared/PromptBody.vue";

const props = defineProps<{
  request: Request;
  canRemember: boolean;
  resolve: (answer: any) => void;
  action: "post" | "get" | "delete";
  title: string;
}>();

const object = computed(() => (props.request.subject as any).object);
const creator = computed(
  () =>
    object.value.actor ??
    (props.request.method === "post" ? props.request.actor : undefined),
);
const operation = computed(
  () => ({ post: "post", get: "access", delete: "delete" })[props.action],
);

</script>

<template>
  <PromptBody
    :request="request"
    :can-remember="canRemember"
    :resolve="resolve"
    :title="title"
    summary=""
  >
    <template #summary>
      <span>asks to {{ operation }}:</span>
      <section class="data">
        <ObjectValue :value="object.value" />
      </section>
    </template>
    <template #details>
      <DetailList>
        <dt>Channels</dt>
        <dd v-if="object.channels.length" class="channels"><ul><li v-for="channel in object.channels" :key="channel"><StructuredValue :value="channel" /></li></ul></dd>
        <dd v-else><em>None</em></dd>
        <dt>Visibility</dt>
        <dd v-if="object.allowed == null"><em>Anyone with the link or a channel</em></dd>
        <dd v-else-if="object.allowed.length === 0"><em>Only you</em></dd>
        <dd v-else><ul class="actors"><li v-for="actor in object.allowed" :key="actor"><IdentityValue :actor="actor" /></li></ul></dd>
        <template v-if="creator">
          <dt>Creator</dt><dd><IdentityValue :actor="creator" /></dd>
        </template>
        <template v-if="object.url"><dt>URL</dt><dd><LinkValue :url="object.url" /></dd></template>
      </DetailList>
    </template>
  </PromptBody>
</template>

<style scoped>
.data { position: relative; width: 100%; margin-top: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; background: var(--background-color); font-size: 1rem; }
.data > * { display: block; margin: 0; padding: 0; }
.actors { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
.channels ul { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
.channels li { max-width: 100%; }
code { word-break: break-all; }
</style>
