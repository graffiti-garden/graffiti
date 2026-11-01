<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef } from "vue";
import { visibilityEvents } from "../../../bootstrap/protocol.js";

const props = defineProps<{
  title: string;
  cancel: () => void;
  blockSite?: () => void;
  confirming: boolean;
  reviewPermissions?: () => void;
}>();
const frame = useTemplateRef("frame");
const titleElement = useTemplateRef("titleElement");
// Header menus and split-button menus use the same dismissal behavior.
function openMenu() {
  return frame.value?.querySelector<HTMLDetailsElement>(".guard-options[open]");
}

function clickAway(event: PointerEvent) {
  const menu = openMenu();
  if (menu && !menu.contains(event.target as Node)) menu.open = false;
}

function escape() {
  const menu = openMenu();
  if (menu) {
    menu.open = false;
    menu.querySelector("summary")?.focus();
  } else props.cancel();
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
        <h1 id="guard-prompt-title" ref="titleElement" tabindex="-1"><slot name="title">{{ title }}</slot></h1>
        <details v-if="blockSite || reviewPermissions" class="guard-options">
          <summary aria-label="More guard options"><span aria-hidden="true">⋯</span></summary>
          <div class="guard-menu">
            <button v-if="blockSite" type="button" @click="blockSite()">
              Block all requests from this site
            </button>
            <button v-if="reviewPermissions" type="button" @click="reviewPermissions()">
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
h1 { flex: 1; margin: 0; color: var(--title-color); font-size: 2rem; line-height: 1.05; overflow-wrap: anywhere; }
h1[tabindex="-1"]:focus { outline: none; }
:deep(.guard-options) { position: relative; flex: none; }
:deep(.guard-options summary) { display: grid; width: 2rem; height: 2rem; place-items: center; border-radius: 0.4rem; color: var(--secondary-color); background: transparent; list-style: none; cursor: pointer; }
:deep(.guard-options summary::-webkit-details-marker) { display: none; }
:deep(.guard-options summary:hover), :deep(.guard-options summary:focus-visible), :deep(.guard-options[open] summary) { color: var(--text-color); background: var(--background-color-interactive-hover); }
:deep(.guard-options[open] summary) { border-radius: 0.4rem 0.4rem 0 0; }
:deep(.guard-options summary:focus-visible) { outline: 2px solid var(--link-color); outline-offset: 0.15rem; }
:deep(.guard-options summary span) { display: grid; height: 100%; place-items: center; font-size: 1.7rem; line-height: 1; }
:deep(.guard-menu) { position: absolute; top: 100%; right: 0; z-index: 1; display: grid; width: max-content; overflow: hidden; border: 1px solid var(--border-color); border-radius: 0.5rem 0 0.5rem 0.5rem; background: var(--background-color); box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 25%); cursor: pointer; }
:deep(.guard-menu :is(button, a)) { display: block; width: auto; border: 0; border-radius: 0; padding: 0.5rem 0.75rem; color: var(--text-color); background: transparent; font-size: 1.15rem; font-weight: 400; line-height: normal; text-align: left; white-space: nowrap; cursor: pointer; }
:deep(.guard-menu :is(button, a):hover), :deep(.guard-menu :is(button, a):focus-visible) { color: var(--text-color); background: var(--background-color-interactive-hover); text-decoration: none; }
:deep(.guard-menu .graffiti-link) { border-top: 1px solid var(--border-color); color: var(--link-color); font-weight: 650; }
.content { display: flex; min-width: 0; flex-direction: column; gap: 1.5rem; }
footer { margin-top: 2.5rem; }
.actions { width: 100%; }
button, :deep(button), :deep(.prompt-action) { border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.25rem 0.5rem; color: var(--accent-button-text); background: var(--accent-button-background); font: inherit; cursor: pointer; }
/* Footer actions and in-body choices share sizing; data controls keep their own. */
.actions :deep(button), :deep(button.prompt-action), :deep(summary.prompt-action) { box-sizing: border-box; min-width: 7rem; min-height: 3rem; max-width: 100%; padding: 0.65rem 1.5rem; font-size: 1.6rem; line-height: 1.3; overflow-wrap: anywhere; }
button:hover, :deep(button:hover), :deep(.prompt-action:hover) { border-color: var(--border-color-hover); background: var(--accent-button-background-hover); text-decoration: none; }
:deep(button.deny) { color: var(--text-color); background: var(--background-color-interactive); }
:deep(button.deny:hover) { color: var(--text-color); background: var(--background-color-interactive-hover); }
/* Keep the primary action and its menu joined, including on narrow screens. */
.actions :deep(.split-action) { display: flex; }
.actions :deep(.split-action > button) { width: auto; min-width: 0; border-radius: 0.5rem 0 0 0.5rem; }
.actions :deep(.split-action summary) { width: 2.25rem; min-width: 2.25rem; height: 100%; border-left: 0; border-radius: 0 0.5rem 0.5rem 0; padding: 0; color: var(--accent-button-text); background: var(--accent-button-background); }
.actions :deep(.split-action summary:hover), .actions :deep(.split-action .guard-options[open] summary) { background: var(--accent-button-background-hover); }
.actions :deep(.guard-menu button) { min-height: 3rem; padding: 0.65rem 0.75rem; white-space: normal; }
.actions :deep(.guard-menu) { max-width: min(22rem, calc(100vw - 3rem)); }
@media (max-width: 42rem) {
  .backdrop { padding: 0.75rem 0.75rem max(0.75rem, env(safe-area-inset-bottom)); }
  .prompt-card { padding: 0.75rem; font-size: 1.125rem; }
  header { gap: 0.5rem; margin-bottom: 1rem; }
  h1 { font-size: 1.55rem; line-height: 1.15; }
  .content { gap: 1rem; }
  footer { margin-top: 1.25rem; }
  :deep(.guard-menu) { max-width: calc(100vw - 1.5rem); }
  :deep(.guard-menu :is(button, a)) { white-space: normal; }
  .actions :deep(button) { width: 100%; }
  .actions :deep(button), :deep(button.prompt-action), :deep(summary.prompt-action) { padding-inline: 0.75rem; font-size: 1.125rem; }
}
@media (prefers-reduced-motion: reduce) { .prompt-card { animation: none; transition: none; } }
@keyframes prompt-enter { from { opacity: 0; transform: translateY(0.3rem) scale(0.99); } }
</style>
