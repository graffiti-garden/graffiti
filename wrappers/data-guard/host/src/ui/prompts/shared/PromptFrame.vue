<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

const props = defineProps<{ title: string; cancel: () => void }>();
const frame = useTemplateRef("frame");
onMounted(() => frame.value?.focus());
</script>

<template>
  <aside @pointerdown.self="props.cancel()">
    <dialog
      ref="frame"
      open
      aria-modal="true"
      tabindex="-1"
      @keydown.esc="props.cancel()"
    >
      <header><h1>{{ title }}</h1></header>
      <div class="content"><slot /></div>
      <footer>
        <button type="button" class="secondary" @click="props.cancel()">Cancel</button>
        <div class="actions"><slot name="actions" /></div>
      </footer>
    </dialog>
  </aside>
</template>

<style scoped>
aside { position: fixed; inset: 0; display: grid; align-items: start; justify-items: center; overflow: auto; padding: 1rem; background: rgb(0 0 0 / 20%); }
dialog { position: static; display: flex; flex-direction: column; width: min(42rem, calc(100vw - 2rem)); overflow: visible; margin: 0; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0 2.5rem rgb(0 0 0 / 90%); font-size: 1.5rem; outline: none; }
header { margin-bottom: 2.5rem; }
h1 { margin: 0; color: var(--title-color); font-size: 2rem; line-height: 1.05; }
.content { display: flex; flex-direction: column; gap: 1.5rem; }
footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; margin-top: 3rem; }
.actions { display: flex; flex-flow: row-reverse wrap; justify-content: flex-end; gap: 0.625rem; }
button, :deep(button) { border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.25rem 0.5rem; color: var(--accent-button-text); background: var(--accent-button-background); font: inherit; cursor: pointer; }
button:hover, :deep(button:hover) { border-color: var(--border-color-hover); background: var(--accent-button-background-hover); text-decoration: none; }
button.secondary { border: 0; border-radius: 0; padding: 0; color: var(--secondary-color); background: transparent; }
button.secondary:hover { color: var(--secondary-hover-color); background: transparent; text-decoration: underline 2px; }
:deep(button.remember) { color: var(--text-color); background: var(--background-color-interactive); }
:deep(button.remember:hover) { background: var(--background-color-interactive-hover); }
@media (max-width: 560px) { aside { padding: 0.75rem; } dialog { width: 100%; } footer, .actions { display: grid; grid-template-columns: 1fr; } .actions { order: -1; } button, :deep(button) { width: 100%; } }
</style>
