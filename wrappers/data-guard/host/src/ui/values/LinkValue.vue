<script setup lang="ts">
import { computed } from "vue";
import ValueBubble from "./ValueBubble.vue";

const props = defineProps<{ url: string }>();
const external = computed(() => /^https?:/i.test(props.url));
</script>

<template>
  <a
    v-if="external"
    class="external"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
  >
    <ValueBubble emoji="🔗" :title="url"><code>{{ url }}</code></ValueBubble>
  </a>
  <ValueBubble v-else emoji="🔗" :title="url"><code>{{ url }}</code></ValueBubble>
</template>

<style scoped>
.external { display: inline-flex; max-width: 100%; color: inherit; text-decoration: none; }
.external:hover { color: inherit; text-decoration: none; }
.external :deep(.value-bubble),
.external :deep(.value-bubble code) { color: var(--link-color); cursor: pointer; }
.external:hover :deep(.value-bubble),
.external:focus-visible :deep(.value-bubble) { border-color: var(--border-color-hover); color: var(--link-hover-color); background: var(--background-color-interactive-hover); }
.external:hover :deep(.value-bubble code),
.external:focus-visible :deep(.value-bubble code) { color: var(--link-hover-color); }
.external:focus-visible { outline: none; }
.external:focus-visible :deep(.value-bubble) { outline: 2px solid var(--link-color); outline-offset: 0.15rem; }
</style>
