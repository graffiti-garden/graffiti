<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from "vue";

const props = defineProps<{
  title: string;
  cancel: () => void;
  reviewPermissions: () => void;
}>();
const frame = useTemplateRef("frame");
const options = useTemplateRef("options");

function clickAway(event: PointerEvent) {
  if (!options.value?.contains(event.target as Node)) {
    options.value?.removeAttribute("open");
  }
}

function escape() {
  if (options.value?.open) options.value.open = false;
  else props.cancel();
}

onMounted(() => {
  frame.value?.focus();
  document.addEventListener("pointerdown", clickAway);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", clickAway));
</script>

<template>
  <div class="backdrop" @pointerdown.self="props.cancel()">
    <dialog
      ref="frame"
      open
      aria-modal="true"
      aria-labelledby="guard-prompt-title"
      tabindex="-1"
      @keydown.esc="escape"
    >
      <header>
        <h1 id="guard-prompt-title">{{ title }}</h1>
        <details ref="options" class="guard-options">
          <summary aria-label="More guard options"><span aria-hidden="true">⋯</span></summary>
          <div class="guard-menu">
            <button type="button" @click="props.reviewPermissions()">
              Review permissions
            </button>
          </div>
        </details>
      </header>
      <div class="content"><slot /></div>
      <footer>
        <button type="button" class="secondary" @click="props.cancel()">Cancel</button>
        <div class="actions"><slot name="actions" /></div>
      </footer>
    </dialog>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; display: grid; align-items: start; justify-items: center; overflow: auto; scrollbar-gutter: stable both-edges; padding: 1rem; background: rgb(0 0 0 / 20%); }
dialog { position: static; display: flex; flex-direction: column; width: min(42rem, calc(100vw - 2rem)); overflow: visible; margin: 0; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0 2.5rem rgb(0 0 0 / 90%); font-size: 1.5rem; outline: none; }
header { position: relative; display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 2.5rem; }
h1 { flex: 1; margin: 0; color: var(--title-color); font-size: 2rem; line-height: 1.05; }
.guard-options { position: relative; flex: none; }
.guard-options summary { display: grid; width: 2rem; height: 2rem; place-items: center; border-radius: 0.4rem; color: var(--secondary-color); background: transparent; list-style: none; cursor: pointer; }
.guard-options summary::-webkit-details-marker { display: none; }
.guard-options summary:hover, .guard-options summary:focus-visible, .guard-options[open] summary { color: var(--text-color); background: var(--background-color-interactive-hover); }
.guard-options[open] summary { border-radius: 0.4rem 0.4rem 0 0; }
.guard-options summary:focus-visible { outline: 2px solid var(--link-color); outline-offset: 0.15rem; }
.guard-options summary span { display: grid; height: 100%; place-items: center; font-size: 1.7rem; line-height: 1; }
.guard-menu { position: absolute; top: 100%; right: 0; z-index: 1; min-width: max-content; overflow: hidden; border: 1px solid var(--border-color); border-radius: 0.5rem 0 0.5rem 0.5rem; background: var(--background-color); box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 25%); cursor: pointer; }
.guard-menu button { width: 100%; border: 0; border-radius: 0; padding: 0.5rem 0.75rem; color: var(--text-color); background: transparent; font-size: 1.15rem; text-align: left; white-space: nowrap; cursor: pointer; }
.guard-menu button:hover, .guard-menu button:focus-visible { background: var(--background-color-interactive-hover); }
.content { display: flex; flex-direction: column; gap: 1.5rem; }
footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; margin-top: 3rem; }
.actions { display: flex; flex-flow: row-reverse wrap; justify-content: flex-end; gap: 0.625rem; }
button, :deep(button) { border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.25rem 0.5rem; color: var(--accent-button-text); background: var(--accent-button-background); font: inherit; cursor: pointer; }
button:hover, :deep(button:hover) { border-color: var(--border-color-hover); background: var(--accent-button-background-hover); text-decoration: none; }
button.secondary { border: 0; border-radius: 0; padding: 0; color: var(--secondary-color); background: transparent; }
button.secondary:hover { color: var(--secondary-hover-color); background: transparent; text-decoration: underline 2px; }
:deep(button.remember) { color: var(--text-color); background: var(--background-color-interactive); }
:deep(button.remember:hover) { background: var(--background-color-interactive-hover); }
@media (max-width: 42rem) { .backdrop { padding: 0.75rem; } dialog { width: 100%; } footer, .actions { display: grid; grid-template-columns: 1fr; } .actions { order: -1; } button, :deep(button) { width: 100%; } }
</style>
