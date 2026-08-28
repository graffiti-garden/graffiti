<script setup lang="ts">
import { format } from "timeago.js";
import ValueBubble from "./ValueBubble.vue";

const props = defineProps<{ value: Date }>();
const relative = format(props.value);
const exact = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(props.value);
</script>

<template>
  <ValueBubble emoji="🕒">
    <time :datetime="value.toISOString()">{{ relative }}</time>
    <template #details>
      <time :datetime="value.toISOString()">{{ exact }}</time>
    </template>
  </ValueBubble>
</template>

<style scoped>
time { font-variant-numeric: tabular-nums; }
</style>
