<script setup lang="ts">
import { ref } from "vue";
import type { Request } from "../../../core/db.js";
import { sourceLabel } from "../../../core/source.js";
import PromptFrame from "./PromptFrame.vue";

const props = withDefaults(
  defineProps<{
    request: Request;
    canRemember: boolean;
    resolve: (answer: false | { remember: boolean; anyChannels?: boolean; anyAllowed?: boolean }) => void;
    title: string;
    summary: string;
    rememberLabel?: string;
    channels?: boolean;
    allowed?: boolean;
    details?: boolean;
  }>(),
  { rememberLabel: "Allow For All Similar Data", details: true },
);

const open = ref(false);
const anyChannels = ref(false);
const anyAllowed = ref(false);
</script>

<template>
  <PromptFrame :title="title" :cancel="() => resolve(false)">
    <div
      class="summary"
      :class="{ expandable: details }"
    >
      <div class="summary-main">
        <button
          v-if="details"
          type="button"
          class="summary-toggle"
          :aria-expanded="open"
          aria-controls="guard-prompt-details"
          @click="open = !open"
        >
          <span class="visually-hidden">
            {{ open ? "Hide details" : "Show details" }}
          </span>
        </button>
        <div class="summary-line">
          <strong>{{ sourceLabel(request.source) }}</strong>
          <slot name="summary">{{ summary }}</slot>
        </div>
      </div>
      <details v-if="details" id="guard-prompt-details" :open="open">
        <summary @click.stop.prevent="open = !open">Show Details</summary>
        <div class="detail-content">
          <slot name="details">
            <pre>{{ JSON.stringify(request.subject, null, 2) }}</pre>
          </slot>
          <label v-if="channels">
            <input v-model="anyChannels" type="checkbox" /> Allow any channels
          </label>
          <label v-if="allowed">
            <input v-model="anyAllowed" type="checkbox" /> Allow any recipients
          </label>
        </div>
      </details>
    </div>
    <template #actions>
      <button type="button" @click="resolve({ remember: false })">Allow Once</button>
      <button
        v-if="canRemember"
        type="button"
        class="remember"
        @click="resolve({ remember: true, anyChannels, anyAllowed })"
      >
        {{ rememberLabel }}
      </button>
    </template>
  </PromptFrame>
</template>

<style scoped>
.summary { position: relative; width: 100%; border: 1px solid var(--border-color); border-radius: 0.5rem; background: color-mix(in srgb, var(--background-color-interactive) 62%, var(--background-color)); }
.summary-main { position: relative; border-radius: inherit; padding: 0.75rem 1.1rem 1rem; }
.summary-toggle { position: absolute; inset: 0; width: 100%; border: 0; border-radius: inherit; padding: 0; color: inherit; background: transparent; cursor: pointer; transition: background-color 120ms ease; }
.summary-toggle:hover, .summary-toggle:focus-visible { border: 0; background: var(--background-color-interactive-hover); outline: none; text-decoration: none; }
.summary-line { position: relative; line-height: 1.45; }
.summary.expandable .summary-line { pointer-events: none; }
.summary-line :deep(.media) { pointer-events: auto; }
.summary-line > strong { margin-right: 0.35rem; }
details { border: 0; background: transparent; font-size: 1rem; cursor: default; }
details[open] { padding: 0 1.1rem 1rem; }
summary { position: absolute; left: 50%; bottom: 0; display: inline-flex; align-items: center; gap: 0.42em; transform: translate(-50%, 50%); border: 1px solid var(--border-color); border-radius: 999px; padding: 0.15rem 0.65rem; background: var(--background-color-interactive); list-style: none; cursor: pointer; transition: border-color 120ms ease, background-color 120ms ease; }
summary::-webkit-details-marker { display: none; }
summary::after { display: inline-flex; width: 0.8em; height: 1em; align-items: center; justify-content: center; content: "▼"; font-size: 0.7em; line-height: 1; }
details[open] summary::after { content: "▲"; }
summary:hover,
.summary.expandable:has(.summary-toggle:hover) summary,
.summary.expandable:has(.summary-toggle:focus-visible) summary { border-color: var(--border-color-hover); background: var(--background-color-interactive-hover); }
.detail-content { display: grid; gap: 0.75rem; margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem; }
pre { max-height: 16rem; overflow: auto; margin: 0; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.6rem 0.7rem; background: var(--background-color-interactive); font-size: 0.85rem; white-space: pre-wrap; overflow-wrap: anywhere; }
label { display: flex; align-items: center; gap: 0.55rem; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
