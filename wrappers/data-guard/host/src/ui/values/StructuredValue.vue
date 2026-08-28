<script setup lang="ts">
import { computed } from "vue";
import BooleanValue from "./BooleanValue.vue";
import GraffitiLinkValue from "./GraffitiLinkValue.vue";
import IdentityValue from "./IdentityValue.vue";
import LinkValue from "./LinkValue.vue";
import TimestampValue from "./TimestampValue.vue";
import UuidValue from "./UuidValue.vue";
import { did, graffitiUrl, timestamp, url, uuid } from "./recognize.js";

const props = defineProps<{ value: unknown; field?: string }>();

const time = computed(() => timestamp(props.value, props.field));
const display = computed(() => String(props.value));
</script>

<template>
  <TimestampValue v-if="time" :value="time" />
  <IdentityValue v-else-if="did(value)" :actor="value" />
  <UuidValue v-else-if="uuid(value)" :value="value" />
  <GraffitiLinkValue v-else-if="graffitiUrl(value)" :url="value" />
  <LinkValue v-else-if="url(value)" :url="value" />
  <BooleanValue v-else-if="typeof value === 'boolean'" :value="value" />
  <span v-else class="plain">{{ display }}</span>
</template>

<style scoped>
.plain { white-space: pre-wrap; }
</style>
