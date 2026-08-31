<script setup lang="ts">
import {
  onBeforeUnmount,
  ref,
  useId,
  useSlots,
  useTemplateRef,
  watch,
} from "vue";

const props = withDefaults(
  defineProps<{
    emoji: string;
    title?: string;
    centered?: boolean;
    flush?: boolean;
  }>(),
  { centered: false, flush: false },
);
const emit = defineEmits<{ "update:pinned": [value: boolean] }>();
const disclosure = Boolean(useSlots().details);
const pinned = ref(false);
const suppressed = ref(false);
const tooltip = useId();
const wrapper = useTemplateRef<HTMLElement>("wrapper");
const centeredStyle = ref<Record<string, string>>({});

function positionCentered() {
  if (!props.centered || !wrapper.value) return;
  const boundary =
    wrapper.value.closest<HTMLElement>("dialog, .record-table") ??
    document.documentElement;
  const wrapperBounds = wrapper.value.getBoundingClientRect();
  const boundaryBounds = boundary.getBoundingClientRect();
  centeredStyle.value = {
    "--tooltip-center": `${boundaryBounds.left + boundaryBounds.width / 2 - wrapperBounds.left}px`,
    "--tooltip-width": `${Math.max(1, Math.min(480, boundaryBounds.width - 32))}px`,
  };
}

function toggle(event: MouseEvent) {
  if (!disclosure) return;
  event.stopPropagation();
  positionCentered();
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
  emit("update:pinned", value);
  if (value) {
    positionCentered();
    document.addEventListener("pointerdown", clickAway);
    window.addEventListener("resize", positionCentered);
  } else {
    document.removeEventListener("pointerdown", clickAway);
    window.removeEventListener("resize", positionCentered);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", clickAway);
  window.removeEventListener("resize", positionCentered);
});
</script>

<template>
  <span
    ref="wrapper"
    class="value-wrapper"
    :class="{ disclosure, pinned, suppressed, centered, flush }"
    @pointerenter="positionCentered"
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
      @focus="positionCentered"
      @blur="resetHover"
    >
      <span class="emoji" aria-hidden="true">{{ emoji }}</span>
      <slot />
    </component>
    <span
      v-if="disclosure"
      :id="tooltip"
      class="tooltip"
      role="tooltip"
      :style="centered ? centeredStyle : undefined"
    >
      <slot name="details" :pinned="pinned" />
    </span>
  </span>
</template>

<style scoped>
.value-wrapper { position: relative; display: inline-flex; min-width: 0; max-width: 100%; vertical-align: baseline; }
.value-wrapper > .value-bubble { display: inline-grid; min-width: 0; max-width: 100%; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 0.35rem; border: 1px solid var(--border-color); border-radius: 0.35rem; padding: 0.05rem 0.45rem; color: inherit; background: var(--background-color-interactive); font-family: system-ui, sans-serif; vertical-align: baseline; }
.disclosure > .value-bubble { cursor: pointer; text-decoration: none; }
.disclosure > .value-bubble:hover, .disclosure > .value-bubble:focus-visible, .disclosure.pinned > .value-bubble { border-color: var(--border-color-hover); color: inherit; background: var(--background-color-interactive-hover); text-decoration: none; }
.disclosure.pinned > .value-bubble { box-shadow: inset 0 1px 2px rgb(0 0 0 / 12%); }
.disclosure:not(.suppressed):hover > .value-bubble, .disclosure:not(.suppressed) > .value-bubble:focus-visible, .disclosure.pinned > .value-bubble { border-end-start-radius: 0; border-end-end-radius: 0; }
.emoji { flex: none; font-family: system-ui, sans-serif; }
.value-bubble :deep(code), .value-bubble :deep(.label) { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
.value-bubble :deep(.uuid) { overflow-wrap: normal; white-space: nowrap; }
.value-bubble :deep(code) { color: var(--secondary-color); font-size: 0.82em; }
.tooltip { position: absolute; top: calc(100% - 1px); left: 0; z-index: 10; width: max-content; min-width: 100%; max-width: min(30rem, calc(100vw - 2rem)); box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 0 0.3rem 0.3rem 0.3rem; padding: 0.3rem 0.45rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0.2rem 0.6rem rgb(0 0 0 / 25%); font-size: 0.8rem; overflow-wrap: anywhere; white-space: normal; opacity: 0; visibility: hidden; pointer-events: none; }
.centered.pinned > .tooltip { left: var(--tooltip-center, 50%); width: var(--tooltip-width, min(30rem, calc(100vw - 2rem))); min-width: 0; max-width: none; transform: translateX(-50%); border: 2px solid color-mix(in srgb, var(--text-color) 48%, var(--border-color)); border-radius: 0.4rem; padding: 0.6rem; box-shadow: 0 0.35rem 1rem rgb(0 0 0 / 32%); text-align: left; }
.centered.pinned.flush > .tooltip { padding: 0; }
.tooltip :deep(code) { overflow-wrap: anywhere; white-space: normal; }
.disclosure:not(.suppressed):hover > .tooltip, .disclosure:not(.suppressed) > .value-bubble:focus-visible + .tooltip, .disclosure.pinned > .tooltip { opacity: 1; visibility: visible; }
.disclosure.pinned > .tooltip { pointer-events: auto; }

@media (max-width: 46rem) {
  .centered.pinned > .tooltip { max-height: calc(100dvh - 2rem); overflow: auto; }
}
</style>
