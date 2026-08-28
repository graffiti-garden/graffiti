<script setup lang="ts">
import {
  onBeforeUnmount,
  ref,
  useId,
  useSlots,
  useTemplateRef,
  watch,
} from "vue";

defineProps<{ emoji: string; title?: string }>();
const disclosure = Boolean(useSlots().details);
const pinned = ref(false);
const suppressed = ref(false);
const tooltip = useId();
const wrapper = useTemplateRef<HTMLElement>("wrapper");

function toggle(event: MouseEvent) {
  if (!disclosure) return;
  event.stopPropagation();
  if (pinned.value) {
    pinned.value = false;
    suppressed.value = true;
  } else {
    pinned.value = true;
    suppressed.value = false;
  }
}

function resetHover() {
  suppressed.value = false;
}

function clickAway(event: PointerEvent) {
  if (!wrapper.value?.contains(event.target as Node)) pinned.value = false;
}

watch(pinned, (value) => {
  if (value) document.addEventListener("pointerdown", clickAway);
  else document.removeEventListener("pointerdown", clickAway);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", clickAway));
</script>

<template>
  <span
    ref="wrapper"
    class="value-wrapper"
    :class="{ disclosure, pinned, suppressed }"
    @pointerleave="resetHover"
  >
    <component
      :is="disclosure ? 'button' : 'span'"
      :type="disclosure ? 'button' : undefined"
      class="value-bubble"
      :title="disclosure ? undefined : title"
      :aria-expanded="disclosure ? pinned : undefined"
      :aria-pressed="disclosure ? pinned : undefined"
      :aria-describedby="disclosure ? tooltip : undefined"
      @click="toggle"
      @blur="resetHover"
    >
      <span class="emoji" aria-hidden="true">{{ emoji }}</span>
      <slot />
    </component>
    <span v-if="disclosure" :id="tooltip" class="tooltip" role="tooltip">
      <slot name="details" :pinned="pinned" />
    </span>
  </span>
</template>

<style scoped>
.value-wrapper { position: relative; display: inline-flex; min-width: 0; max-width: 100%; vertical-align: baseline; }
.value-wrapper > .value-bubble { display: inline-grid; min-width: 0; max-width: 100%; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 0.35rem; border: 1px solid var(--border-color); border-radius: 0.35rem; padding: 0.05rem 0.45rem; color: inherit; background: var(--background-color-interactive); font-family: system-ui, sans-serif; vertical-align: baseline; }
.disclosure .value-bubble { cursor: pointer; text-decoration: none; }
.disclosure .value-bubble:hover, .disclosure .value-bubble:focus-visible, .disclosure.pinned .value-bubble { border-color: var(--border-color-hover); color: inherit; background: var(--background-color-interactive-hover); text-decoration: none; }
.disclosure.pinned .value-bubble { box-shadow: inset 0 1px 2px rgb(0 0 0 / 12%); }
.disclosure:not(.suppressed):hover .value-bubble, .disclosure:not(.suppressed) .value-bubble:focus-visible, .disclosure.pinned .value-bubble { border-end-start-radius: 0; border-end-end-radius: 0; }
.emoji { flex: none; font-family: system-ui, sans-serif; }
.value-bubble :deep(code), .value-bubble :deep(.label) { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
.value-bubble :deep(.uuid) { overflow-wrap: normal; white-space: nowrap; }
.value-bubble :deep(code) { color: var(--secondary-color); font-size: 0.82em; }
.tooltip { position: absolute; top: calc(100% - 1px); left: 0; z-index: 10; width: max-content; min-width: 100%; max-width: min(30rem, calc(100vw - 2rem)); border: 1px solid var(--border-color); border-radius: 0 0.3rem 0.3rem 0.3rem; padding: 0.3rem 0.45rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0.2rem 0.6rem rgb(0 0 0 / 25%); font-size: 0.8rem; overflow-wrap: anywhere; white-space: normal; opacity: 0; visibility: hidden; pointer-events: none; }
.tooltip :deep(code) { overflow-wrap: anywhere; white-space: normal; }
.disclosure:not(.suppressed):hover .tooltip, .disclosure:not(.suppressed) .value-bubble:focus-visible + .tooltip, .disclosure.pinned .tooltip { opacity: 1; visibility: visible; }
.disclosure.pinned .tooltip { pointer-events: auto; }
</style>
