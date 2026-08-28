<script setup lang="ts">
import ValueBubble from "./ValueBubble.vue";
import { abbreviate } from "./recognize.js";

defineProps<{ value: string }>();
</script>

<template>
  <ValueBubble emoji="🆔">
    <code class="uuid">{{ abbreviate(value) }}</code>
    <template #details><code>{{ value }}</code></template>
  </ValueBubble>
</template>
