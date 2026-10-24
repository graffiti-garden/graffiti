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

function hasChildren(value: any) {
  return container(value) && entries(value).length > 0;
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
    :class="{ nested, array: Array.isArray(value) }"
    :style="Array.isArray(value) ? undefined : `--property-column: ${propertyColumn}%`"
    role="table"
    :aria-label="Array.isArray(value) ? 'List items' : field ? `${field} properties` : 'Data properties'"
  >
    <div v-if="!nested && !Array.isArray(value)" class="heading" role="row">
      <span class="heading-key" role="columnheader">Property</span>
      <span class="heading-value" role="columnheader">Value</span>
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
    <div
      v-for="([key, item], index) in entries(value)"
      :key="key"
      class="row"
      :class="{ interactive: rowInteractive(index), 'has-children': hasChildren(item) }"
      role="row"
    >
      <span class="key" role="rowheader">
        {{ keyLabel(key, value) }}
      </span>
      <div class="value" :class="{ 'nested-value': hasChildren(item) }" role="cell">
        <StructuredValue v-if="!container(item)" :value="item" :field="String(key)" />
        <ObjectValue
          v-else
          :value="item"
          nested
          :first-interactive="!rowInteractive(index)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.table { --property-column: 28%; position: relative; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; border-radius: 0.35rem; line-height: 1.5; }
.table.array { --property-column: 2.5rem; }
.table.nested { border: 1px solid var(--border-color); border-radius: 0.35rem; }
.row, .heading { display: grid; width: 100%; min-width: 0; box-sizing: border-box; grid-template-columns: var(--property-column) minmax(0, 1fr); align-items: stretch; }
.row { background: var(--background-color); }
.row.interactive { background: var(--background-color-interactive); }
.heading { border-start-start-radius: 0.35rem; border-start-end-radius: 0.35rem; border-bottom: 1px solid var(--border-color); color: var(--secondary-color); background: var(--background-color-interactive); font-size: 0.8rem; font-weight: 600; line-height: 1.2; }
.heading-key, .heading-value { display: flex; min-width: 0; align-items: center; padding: 0.35rem 0.55rem; }
.heading-key { border-right: 3px solid var(--border-color); }
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
@media (max-width: 42rem) {
  .table.nested { --branch-color: var(--spine-color, var(--border-color)); --branch-indent: 0.6rem; --branch-top: 0.9rem; --parent-spine-width: var(--spine-width, 2px); border: 0; border-radius: 0; padding-left: var(--branch-indent); }
  .table:not(.nested) > .heading + .row { border-start-start-radius: 0.35rem; border-start-end-radius: 0.35rem; }
  .table.nested > .row { --row-edge-color: var(--border-color); border-left: 2px solid var(--row-edge-color); border-radius: 0; }
  .table.nested > .row.interactive { --row-edge-color: color-mix(in srgb, var(--border-color) 55%, var(--background-color)); }
  .heading { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .row { position: relative; display: block; }
  .table > .row + .row { border-top: 1px solid var(--border-color); }
  .row.has-children { --spine-color: var(--row-edge-color, var(--border-color)); --spine-width: 2px; border-left: var(--spine-width) solid var(--spine-color); }
  .table:not(.nested) > .row.has-children { --spine-color: color-mix(in srgb, var(--accent-button-background) 75%, var(--border-color)); --spine-width: 3px; }
  .key, .table.array > .row > .key { display: block; border-right: 0; padding: 0.35rem 0.5rem 0; color: var(--secondary-color); font-size: 0.85rem; line-height: 1.2; }
  .table.nested > .row > .key { position: relative; }
  .table.nested > .row > .key::before { position: absolute; top: var(--branch-top); left: calc(0px - var(--branch-indent) - 2px); width: var(--branch-indent); border-top: 2px solid var(--branch-color); content: ""; }
  /* Hide the parent spine below the final branch, leaving a break before the next group. */
  .table.nested > .row:last-of-type::after { position: absolute; top: calc(var(--branch-top) + 2px); bottom: 0; left: calc(0px - var(--branch-indent) - var(--parent-spine-width) - 2px); z-index: 1; width: calc(var(--parent-spine-width) + 1px); background: var(--background-color); content: ""; }
  .row.has-children > .key { border-bottom: 1px solid var(--border-color); padding: 0.35rem 0.5rem; color: var(--text-color); background: inherit; font-size: 1rem; line-height: 1.35; }
  .table:not(.nested) > .heading + .row.has-children > .key { border-start-end-radius: 0.35rem; }
  .value { padding: 0.15rem 0.5rem 0.45rem; }
  .value.nested-value { padding: 0; background: var(--background-color); }
  .table > .column-resizer, .table > .column-resizer:hover, .table > .column-resizer:focus-visible { display: none; }
}
</style>
