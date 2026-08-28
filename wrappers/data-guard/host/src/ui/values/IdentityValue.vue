<script setup lang="ts">
import { GraffitiActorToHandle } from "@graffiti-garden/wrapper-vue";
import ValueBubble from "./ValueBubble.vue";

defineProps<{ actor: string }>();
</script>

<template>
  <GraffitiActorToHandle v-slot="{ handle }" :actor="actor">
    <ValueBubble emoji="👤">
      <span class="label">{{ handle ?? "Identity" }}</span>
      <template #details><code>{{ actor }}</code></template>
    </ValueBubble>
  </GraffitiActorToHandle>
</template>
