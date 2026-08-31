<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import StructuredValue from "../values/StructuredValue.vue";

const props = withDefaults(
  defineProps<{
    value: any;
    nested?: boolean;
    field?: string;
    firstInteractive?: boolean;
  }>(),
  { firstInteractive: false },
);
const table = useTemplateRef<HTMLElement>("table");
const propertyColumn = ref(28);
const resizing = ref(false);

function entries(value: any) {
  return Array.isArray(value) ? [...value.entries()] : Object.entries(value);
}

function container(value: any) {
  return value !== null && typeof value === "object";
}

function keyLabel(key: string | number, parent: any) {
  return Array.isArray(parent) ? `${Number(key) + 1}.` : key;
}

function rowInteractive(index: number) {
  return index % 2 === 0
    ? props.firstInteractive
    : !props.firstInteractive;
}

function resize(event: PointerEvent) {
  if (!resizing.value || !table.value) return;
  const bounds = table.value.getBoundingClientRect();
  propertyColumn.value = Math.min(
    55,
    Math.max(18, ((event.clientX - bounds.left) / bounds.width) * 100),
  );
}

function startResize(event: PointerEvent) {
  event.preventDefault();
  resizing.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resize(event);
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  propertyColumn.value = Math.min(
    55,
    Math.max(18, propertyColumn.value + (event.key === "ArrowLeft" ? -2 : 2)),
  );
}
</script>

<template>
  <StructuredValue v-if="!container(value)" :value="value" :field="field" />
  <em v-else-if="entries(value).length === 0" class="empty">
    {{ Array.isArray(value) ? "Empty list" : "Empty object" }}
  </em>
  <div
    v-else
    ref="table"
    class="table"
    :class="{ nested, array: Array.isArray(value), reverse: !firstInteractive }"
    :style="Array.isArray(value) ? undefined : `--property-column: ${propertyColumn}%`"
    role="table"
  >
    <div v-for="([key, item], index) in entries(value)" :key="key" class="row" role="row">
      <span class="key" role="rowheader">
        {{ keyLabel(key, value) }}
      </span>
      <div class="value" role="cell">
        <StructuredValue v-if="!container(item)" :value="item" :field="String(key)" />
        <ObjectValue
          v-else
          :value="item"
          nested
          :first-interactive="!rowInteractive(index)"
        />
      </div>
    </div>
    <button
      v-if="!Array.isArray(value)"
      type="button"
      class="column-resizer"
      role="separator"
      aria-label="Resize property column"
      aria-orientation="vertical"
      aria-valuemin="18"
      aria-valuemax="55"
      :aria-valuenow="Math.round(propertyColumn)"
      @pointerdown="startResize"
      @pointermove="resize"
      @pointerup="resizing = false"
      @pointercancel="resizing = false"
      @keydown="resizeWithKeyboard"
    />
  </div>
</template>

<style scoped>
.table { --property-column: 28%; position: relative; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; border-radius: 0.35rem; line-height: 1.5; }
.table.array { --property-column: 2.5rem; }
.table.nested { border: 1px solid var(--border-color); border-radius: 0.35rem; }
.row { display: grid; width: 100%; min-width: 0; box-sizing: border-box; grid-template-columns: var(--property-column) minmax(0, 1fr); align-items: stretch; }
.table > .row:nth-child(odd) { background: var(--background-color-interactive); }
.table > .row:nth-child(even) { background: var(--background-color); }
.table.reverse > .row:nth-child(odd) { background: var(--background-color); }
.table.reverse > .row:nth-child(even) { background: var(--background-color-interactive); }
.table > .row:first-child { border-start-start-radius: 0.35rem; border-start-end-radius: 0.35rem; }
.table > .row:last-of-type { border-end-start-radius: 0.35rem; border-end-end-radius: 0.35rem; }
.key { display: flex; min-width: 0; box-sizing: border-box; align-items: center; border-right: 3px solid var(--border-color); padding: 0.35rem 0.55rem; font-weight: 700; overflow-wrap: anywhere; }
.table.array > .row > .key { justify-content: flex-end; padding-right: 0.45rem; font-weight: 400; }
.value { min-width: 0; box-sizing: border-box; padding: 0.35rem 0.55rem; overflow-wrap: anywhere; }
.empty { color: var(--secondary-color); }
.table > .column-resizer, .table > .column-resizer:hover, .table > .column-resizer:focus-visible { position: absolute; top: 0; bottom: 0; left: var(--property-column); z-index: 2; width: 0.9rem; transform: translateX(-50%); border: 0; border-radius: 0; padding: 0; color: transparent; background: transparent; box-shadow: none; cursor: col-resize; touch-action: none; }
.column-resizer::after { position: absolute; top: 0; bottom: 0; left: 50%; width: 3px; transform: translateX(-50%); background: transparent; content: ""; }
.column-resizer:hover::after,
.column-resizer:active::after,
.column-resizer:focus-visible::after { background: color-mix(in srgb, var(--text-color) 40%, var(--border-color)); }
.column-resizer:focus-visible { outline: none; }
</style>
