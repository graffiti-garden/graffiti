<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { computed } from "vue";
import type { Permission } from "../core/db.js";
import { formatBytes, mediaLabels } from "./media.js";
import ObjectValue from "./prompts/ObjectValue.vue";
import GraffitiLinkValue from "./values/GraffitiLinkValue.vue";
import ValueBubble from "./values/ValueBubble.vue";

const props = defineProps<{
  permission: Permission;
  session: GraffitiSession;
}>();

const match = computed(() => props.permission.match);
const exactUrl = computed(() =>
  "url" in match.value ? match.value.url : undefined,
);
const label = computed(() => {
  const current = match.value;
  if (current.kind === "logout") return "Your session";
  if (current.kind === "media") {
    if ("example" in current) {
      return capitalize(String(mediaLabels(current.example.type).item));
    }
    return "File";
  }
  return "View data";
});

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
</script>

<template>
  <GraffitiLinkValue
    v-if="exactUrl"
    :url="exactUrl"
    :session="session"
    lazy
  />
  <ValueBubble
    v-else-if="match.kind !== 'logout'"
    :emoji="match.kind === 'media' ? '📎' : '🎨'"
    centered
  >
    <span class="label">{{ label }}</span>
    <template #details="{ pinned }">
      <span v-if="!pinned" class="hint">Click to inspect</span>
      <div v-else class="inspector">
        <section v-if="match.kind === 'object' && 'example' in match">
          <h3>Data this decision was based on</h3>
          <ObjectValue :value="match.example" />
        </section>
        <p class="explanation">
          This decision also applies to
          {{ match.kind === "media" ? "similar files" : "data with the same structure" }}.
        </p>

        <dl v-if="match.kind === 'media' && 'example' in match" class="scope">
          <dt>File type</dt>
          <dd>{{ mediaLabels(match.example.type).description }}</dd>
          <dt>Size</dt>
          <dd>{{ formatBytes(match.example.size) }}</dd>
          <template v-if="match.example.name">
            <dt>Name</dt>
            <dd>{{ match.example.name }}</dd>
          </template>
        </dl>
      </div>
    </template>
  </ValueBubble>
  <span v-else>{{ label }}</span>
</template>

<style scoped>
.inspector { display: grid; gap: 0.9rem; max-height: min(34rem, calc(100dvh - 5rem)); overflow: auto; padding: 0.1rem; }
.hint { color: var(--secondary-color); white-space: nowrap; }
h3 { margin: 0 0 0.45rem; color: var(--secondary-color); font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; }
.explanation { margin: 0; color: var(--secondary-color); line-height: 1.4; }
.scope { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.35rem 0.8rem; margin: 0; border-top: 1px solid var(--border-color); padding-top: 0.75rem; }
.scope dt { color: var(--secondary-color); font-weight: 650; }
.scope dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
</style>
