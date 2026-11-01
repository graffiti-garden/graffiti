<script setup lang="ts">
import { computed } from "vue";
import type { Request } from "../../core/db.js";
import type { GuardAnswer } from "../../core/guard.js";
import { originSiteLabel } from "../remember.js";
import IdentityValue from "../values/IdentityValue.vue";
import LinkValue from "../values/LinkValue.vue";
import ObjectValue from "./ObjectValue.vue";
import ObjectPlacementDetails from "./ObjectPlacementDetails.vue";
import DetailList from "./shared/DetailList.vue";
import PromptBody from "./shared/PromptBody.vue";

type PromptObject = {
  value: Record<string, unknown>;
  channels: string[];
  allowed?: string[] | null;
  actor?: string;
  url?: string;
};

const props = defineProps<{
  request: Request & { method: "post" | "get" | "delete" };
  canRemember: boolean;
  resolve: (answer: GuardAnswer) => void;
}>();

const object = computed(() => (props.request.subject as { object: PromptObject }).object);
const displayValue = computed(() => {
  const { "via site": _site, ...appValue } = object.value.value;
  return appValue;
});
const creator = computed(
  () =>
    object.value.actor ??
    (props.request.method === "post" ? props.request.actor : undefined),
);
const operation = computed(() => ({ post: "post", get: "access this data", delete: "delete this data" })[props.request.method]);
const title = computed(() => ({
  post: "Post this data?",
  get: "Allow this site to read this private data?",
  delete: "Let this site delete this item?",
})[props.request.method]);
</script>

<template>
  <PromptBody
    :request="request"
    :can-remember="canRemember"
    :resolve="resolve"
    :title="title"
  >
    <template #summary>
      <span>asks to {{ operation }}<span v-if="request.originSite"> created on <strong>{{ originSiteLabel(request.originSite) }}</strong></span>:</span>
      <section class="data">
        <ObjectValue :value="displayValue" />
      </section>
    </template>
    <template #details>
      <ObjectPlacementDetails
        :channels="object.channels"
        :allowed="object.allowed"
        help
      />
      <DetailList>
        <template v-if="creator">
          <dt>Creator</dt><dd><IdentityValue :actor="creator" /></dd>
        </template>
        <template v-if="object.url"><dt>URL</dt><dd><LinkValue :url="object.url" /></dd></template>
      </DetailList>
    </template>
  </PromptBody>
</template>

<style scoped>
.data { position: relative; width: 100%; max-width: 100%; box-sizing: border-box; margin-top: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.4rem; background: var(--background-color); font-size: 1rem; }
.data > * { display: block; margin: 0; padding: 0; }
@media (max-width: 42rem) {
  .data { min-width: 0; margin-top: 0.35rem; }
}
</style>
