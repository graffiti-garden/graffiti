<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Request } from "../../core/db.js";
import { summarizeObject } from "../object_summary.js";
import PromptBody from "./shared/PromptBody.vue";

const props = defineProps<{
  request: Request;
  canRemember: boolean;
  resolve: (answer: any) => void;
  action: "post" | "get" | "delete";
  title: string;
}>();

const ai = ref("Local AI summary is loading…");
const summary = computed(
  () =>
    ({
      post: "wants to store data.",
      get: "wants to read data.",
      delete: "wants to delete data.",
    })[props.action] + ` ${ai.value}`,
);

onMounted(async () => {
  const object = (props.request.subject as any).object;
  const result = await summarizeObject(object);
  ai.value = result ? `Local AI: ${result}` : "Local AI summary unavailable.";
});
</script>

<template>
  <PromptBody
    :request="request"
    :can-remember="canRemember"
    :resolve="resolve"
    :title="title"
    :summary="summary"
    channels
    :allowed="Array.isArray((request.subject as any).object.allowed)"
  />
</template>
