<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef } from "vue";
import { visibilityEvents } from "../../../bootstrap/protocol.js";

const props = defineProps<{
  title: string;
  cancel: () => void;
  blockSite: () => void;
  confirming: boolean;
  reviewPermissions: () => void;
}>();
const frame = useTemplateRef("frame");
const titleElement = useTemplateRef("titleElement");
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

function focusTitle() {
  void nextTick(() => titleElement.value?.focus());
}

onMounted(() => {
  frame.value?.showModal();
  focusTitle();
  visibilityEvents.addEventListener("shown", focusTitle);
  document.addEventListener("pointerdown", clickAway);
});
onBeforeUnmount(() => {
  visibilityEvents.removeEventListener("shown", focusTitle);
  document.removeEventListener("pointerdown", clickAway);
  if (frame.value?.open) frame.value.close();
});
</script>

<template>
  <dialog
    ref="frame"
    class="backdrop"
    :class="{ confirming }"
    aria-labelledby="guard-prompt-title"
    @pointerdown.self="props.cancel()"
    @cancel.prevent="escape"
  >
    <div class="prompt-card">
      <header>
        <h1 id="guard-prompt-title" ref="titleElement" tabindex="-1">{{ title }}</h1>
        <details ref="options" class="guard-options">
          <summary aria-label="More guard options"><span aria-hidden="true">⋯</span></summary>
          <div class="guard-menu">
            <button type="button" @click="props.blockSite()">
              Block all requests from this site
            </button>
            <button type="button" @click="props.reviewPermissions()">
              Review permissions
            </button>
            <a
              class="graffiti-link"
              href="https://graffiti.garden"
              target="_blank"
              rel="noopener noreferrer"
            >
              About Graffiti <span aria-hidden="true">↗</span>
            </a>
          </div>
        </details>
      </header>
      <div class="content"><slot /></div>
      <footer>
        <div class="actions"><slot name="actions" /></div>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; display: block; width: 100%; height: 100%; max-width: none; max-height: none; box-sizing: border-box; overflow-x: hidden; overflow-y: auto; margin: 0; border: 0; padding: 1rem; background: transparent; }
.backdrop:not([open]) { display: none; }
.backdrop::backdrop { background: transparent; }
.prompt-card { display: flex; min-width: 0; max-width: 100%; box-sizing: border-box; flex-direction: column; width: min(42rem, 100%); margin: 0 auto; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0 2.5rem rgb(0 0 0 / 90%); font-size: 1.5rem; animation: prompt-enter 140ms ease-out; transition: opacity 140ms ease-in, transform 140ms ease-in; }
.backdrop.confirming { pointer-events: none; }
.backdrop.confirming .prompt-card { opacity: 0; transform: translateY(-0.3rem) scale(0.99); }
header { position: relative; display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 2.5rem; }
h1 { flex: 1; margin: 0; color: var(--title-color); font-size: 2rem; line-height: 1.05; }
h1[tabindex="-1"]:focus { outline: none; }
.guard-options { position: relative; flex: none; }
.guard-options summary { display: grid; width: 2rem; height: 2rem; place-items: center; border-radius: 0.4rem; color: var(--secondary-color); background: transparent; list-style: none; cursor: pointer; }
.guard-options summary::-webkit-details-marker { display: none; }
.guard-options summary:hover, .guard-options summary:focus-visible, .guard-options[open] summary { color: var(--text-color); background: var(--background-color-interactive-hover); }
.guard-options[open] summary { border-radius: 0.4rem 0.4rem 0 0; }
.guard-options summary:focus-visible { outline: 2px solid var(--link-color); outline-offset: 0.15rem; }
.guard-options summary span { display: grid; height: 100%; place-items: center; font-size: 1.7rem; line-height: 1; }
.guard-menu { position: absolute; top: 100%; right: 0; z-index: 1; display: grid; width: max-content; overflow: hidden; border: 1px solid var(--border-color); border-radius: 0.5rem 0 0.5rem 0.5rem; background: var(--background-color); box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 25%); cursor: pointer; }
.guard-menu :is(button, a) { display: block; width: auto; border: 0; border-radius: 0; padding: 0.5rem 0.75rem; color: var(--text-color); background: transparent; font-size: 1.15rem; font-weight: 400; line-height: normal; text-align: left; white-space: nowrap; cursor: pointer; }
.guard-menu :is(button, a):hover, .guard-menu :is(button, a):focus-visible { color: var(--text-color); background: var(--background-color-interactive-hover); text-decoration: none; }
.guard-menu .graffiti-link { border-top: 1px solid var(--border-color); color: var(--link-color); font-weight: 650; }
.content { display: flex; min-width: 0; flex-direction: column; gap: 1.5rem; }
footer { margin-top: 2.5rem; }
.actions { width: 100%; }
button, :deep(button) { border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.25rem 0.5rem; color: var(--accent-button-text); background: var(--accent-button-background); font: inherit; cursor: pointer; }
button:hover, :deep(button:hover) { border-color: var(--border-color-hover); background: var(--accent-button-background-hover); text-decoration: none; }
@media (max-width: 42rem) {
  .backdrop { padding: 0.75rem 0.75rem max(0.75rem, env(safe-area-inset-bottom)); }
  .prompt-card { padding: 0.75rem; font-size: 1.125rem; }
  header { gap: 0.5rem; margin-bottom: 1rem; }
  h1 { font-size: 1.55rem; line-height: 1.15; }
  .content { gap: 1rem; }
  footer { margin-top: 1.25rem; }
  .guard-menu { max-width: calc(100vw - 1.5rem); }
  .guard-menu :is(button, a) { white-space: normal; }
  .actions :deep(button) { width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .prompt-card { animation: none; transition: none; } }
@keyframes prompt-enter { from { opacity: 0; transform: translateY(0.3rem) scale(0.99); } }
</style>
