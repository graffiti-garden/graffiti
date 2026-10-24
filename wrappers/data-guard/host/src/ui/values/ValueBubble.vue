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
const panelId = useId();
const triggerId = useId();
const wrapper = useTemplateRef<HTMLElement>("wrapper");
const centeredStyle = ref<Record<string, string>>({});

function positionCentered() {
  if ((!props.centered && !window.matchMedia("(max-width: 46rem)").matches) || !wrapper.value) return;
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
  pinned.value = !pinned.value;
}

function closeWithEscape(event: KeyboardEvent) {
  if (!pinned.value) return;
  event.stopPropagation();
  event.preventDefault();
  pinned.value = false;
  wrapper.value?.querySelector<HTMLButtonElement>(".value-bubble")?.focus();
}

function closeOnFocusExit(event: FocusEvent) {
  if (!wrapper.value?.contains(event.relatedTarget as Node | null)) pinned.value = false;
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
    :class="{ disclosure, pinned, centered, flush }"
    @keydown.esc="closeWithEscape"
    @focusout="closeOnFocusExit"
  >
    <component
      :is="disclosure ? 'button' : 'span'"
      :id="disclosure ? triggerId : undefined"
      :type="disclosure ? 'button' : undefined"
      class="value-bubble"
      :title="disclosure ? undefined : title"
      :aria-expanded="disclosure ? pinned : undefined"
      :aria-controls="disclosure ? panelId : undefined"
      @click="toggle"
    >
      <span class="emoji" aria-hidden="true">{{ emoji }}</span>
      <slot />
      <span v-if="disclosure" class="disclosure-icon" aria-hidden="true">{{ pinned ? "▲" : "▼" }}</span>
    </component>
    <span
      v-if="disclosure"
      :id="panelId"
      class="detail-panel"
      role="region"
      :aria-labelledby="triggerId"
      :hidden="!pinned"
      :style="centeredStyle"
    >
      <slot name="details" :pinned="pinned" />
    </span>
  </span>
</template>

<style scoped>
.value-wrapper { position: relative; display: inline-flex; min-width: 0; max-width: 100%; vertical-align: baseline; }
.value-wrapper > .value-bubble { display: inline-grid; min-width: 0; max-width: 100%; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 0.35rem; border: 1px solid var(--border-color); border-radius: 0.35rem; padding: 0.05rem 0.45rem; color: inherit; background: var(--background-color-interactive); font-family: system-ui, sans-serif; vertical-align: baseline; }
.disclosure > .value-bubble { grid-template-columns: auto minmax(0, 1fr) auto; cursor: pointer; text-decoration: none; }
.disclosure > .value-bubble:hover, .disclosure > .value-bubble:focus-visible, .disclosure.pinned > .value-bubble { border-color: var(--border-color-hover); color: inherit; background: var(--background-color-interactive-hover); text-decoration: none; }
.disclosure.pinned > .value-bubble { border-end-start-radius: 0; border-end-end-radius: 0; box-shadow: inset 0 1px 2px rgb(0 0 0 / 12%); }
.emoji { flex: none; font-family: system-ui, sans-serif; }
.disclosure-icon { align-self: center; font-size: 0.65em; }
.value-bubble :deep(code), .value-bubble :deep(.label) { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
.value-bubble :deep(.uuid) { overflow-wrap: normal; white-space: nowrap; }
.value-bubble :deep(code) { color: var(--secondary-color); font-size: 0.82em; }
.detail-panel { position: absolute; top: calc(100% - 1px); left: 0; z-index: 10; display: block; width: max-content; min-width: 100%; max-width: min(30rem, calc(100vw - 2rem)); max-height: min(34rem, calc(100svh - 5rem)); overflow: auto; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 0 0.3rem 0.3rem 0.3rem; padding: 0.3rem 0.45rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0.2rem 0.6rem rgb(0 0 0 / 25%); font-size: 0.8rem; overflow-wrap: anywhere; white-space: normal; }
.detail-panel[hidden] { display: none; }
.centered.pinned > .detail-panel { left: var(--tooltip-center, 50%); width: var(--tooltip-width, min(30rem, calc(100vw - 2rem))); min-width: 0; max-width: none; transform: translateX(-50%); border: 2px solid color-mix(in srgb, var(--text-color) 48%, var(--border-color)); border-radius: 0.4rem; padding: 0.6rem; box-shadow: 0 0.35rem 1rem rgb(0 0 0 / 32%); text-align: left; }
.centered.pinned.flush > .detail-panel { padding: 0; }
.detail-panel :deep(code) { overflow-wrap: anywhere; white-space: normal; }

@media (max-width: 46rem) {
  .disclosure > .detail-panel { left: var(--tooltip-center, 50%); width: var(--tooltip-width, min(30rem, calc(100vw - 2rem))); min-width: 0; max-width: none; transform: translateX(-50%); border-radius: 0.4rem; }
}
</style>
