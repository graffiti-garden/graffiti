<script setup lang="ts">
import ValueBubble from "./ValueBubble.vue";

defineProps<{ value: boolean }>();
</script>

<template>
  <ValueBubble :emoji="value ? '✅' : '❌'" :title="String(value)">
    {{ value ? "Yes" : "No" }}
  </ValueBubble>
</template>
