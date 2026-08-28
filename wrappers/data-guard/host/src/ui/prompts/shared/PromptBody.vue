<script setup lang="ts">
import { ref } from "vue";
import { requestAudit } from "../../../bootstrap/protocol.js";
import type { Request } from "../../../core/db.js";
import { sourceLabel } from "../../../core/source.js";
import PromptFrame from "./PromptFrame.vue";

withDefaults(
  defineProps<{
    request: Request;
    canRemember: boolean;
    resolve: (answer: false | { remember: boolean }) => void;
    title: string;
    summary: string;
    rememberLabel?: string;
    details?: boolean;
  }>(),
  { rememberLabel: "Allow For All Similar Data", details: true },
);

const open = ref(false);
</script>

<template>
  <PromptFrame
    :title="title"
    :cancel="() => resolve(false)"
    :review-permissions="() => requestAudit(request.actor, request.source.path)"
  >
    <div class="summary">
      <div class="summary-main">
        <div class="summary-line">
          <strong>{{ sourceLabel(request.source) }}</strong>
          <slot name="summary">{{ summary }}</slot>
        </div>
      </div>
      <details v-if="details" id="guard-prompt-details" :open="open">
        <summary @click.stop.prevent="open = !open">
          {{ open ? "Hide Details" : "Show Details" }}
        </summary>
        <div class="detail-content">
          <slot name="details" />
        </div>
      </details>
    </div>
    <template #actions>
      <button type="button" @click="resolve({ remember: false })">Allow Once</button>
      <button
        v-if="canRemember"
        type="button"
        class="remember"
        @click="resolve({ remember: true })"
      >
        {{ rememberLabel }}
      </button>
    </template>
  </PromptFrame>
</template>

<style scoped>
.summary { position: relative; width: 100%; border: 1px solid var(--border-color); border-radius: 0.5rem; background: color-mix(in srgb, var(--background-color-interactive) 62%, var(--background-color)); }
.summary-main { position: relative; border-radius: inherit; padding: 0.75rem 1.1rem 1.5rem; }
.summary-line { position: relative; line-height: 1.45; }
.summary-line > strong { margin-right: 0.35rem; }
details { position: relative; border: 0; border-top: 1px solid transparent; background: transparent; font-size: 1rem; cursor: default; }
details[open] { border-top-color: var(--border-color); padding: 0 1.1rem 1rem; }
summary { position: absolute; top: 0; left: 50%; display: inline-flex; min-width: 10rem; align-items: center; justify-content: center; gap: 0.42em; transform: translate(-50%, -50%); border: 1px solid var(--border-color); border-radius: 999px; padding: 0.45rem 1rem; background: var(--background-color-interactive); font-size: 1.05rem; list-style: none; cursor: pointer; transition: border-color 120ms ease, background-color 120ms ease; }
summary::-webkit-details-marker { display: none; }
summary::after { display: inline-flex; width: 0.8em; height: 1em; align-items: center; justify-content: center; content: "▼"; font-size: 0.7em; line-height: 1; }
details[open] summary::after { content: "▲"; }
summary:hover, summary:focus-visible { border-color: var(--border-color-hover); background: var(--background-color-interactive-hover); }
.detail-content { display: grid; gap: 0.75rem; padding-top: 2rem; }
</style>
