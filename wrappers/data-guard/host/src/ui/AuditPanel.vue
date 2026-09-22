<script setup lang="ts">
import {
  GraffitiActorToHandle,
  useGraffiti,
  useGraffitiDiscover,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { computed, ref, useTemplateRef, watch } from "vue";
import {
  ruleActor,
  ruleId,
  ruleSchema,
  rulesFromObjects,
  type AccessRule,
} from "../core/rules.js";
import type { Source } from "../core/source.js";
import { sourceLabel } from "../core/source.js";
import PermissionDataValue from "./PermissionDataValue.vue";
import TimestampValue from "./values/TimestampValue.vue";

const PAGE_SIZE = 100;
const MIN_COLUMN_WIDTH = 6;
const columns = [
  ["Decision", "decision"],
  ["Action", "action"],
  ["Data", "data"],
  ["Site", "source"],
  ["Added", "createdAt"],
  ["", ""],
] as const;
type SortKey = (typeof columns)[number][1];

const props = defineProps<{
  initialSource?: Source;
  initialActor?: string;
  redirectUrl?: string;
}>();

const graffiti = useGraffiti();
const session = useGraffitiSession();
const actor = computed(() => props.initialActor ?? session.value?.actor);
const activeSession = computed(() =>
  session.value && session.value.actor === actor.value ? session.value : null,
);
const channels = computed(() => (actor.value ? [actor.value] : []));
const schema = computed(() => ruleSchema(actor.value ?? ""));
const { objects, isFirstPoll, poll } = useGraffitiDiscover(
  channels,
  schema,
  activeSession,
);

const urlSites = new URL(window.location.href).searchParams
  .getAll("site")
  .filter(Boolean);
const selectedSources = ref<string[]>(
  urlSites.length
    ? urlSites
    : props.initialSource
      ? [props.initialSource.key]
      : [],
);
const page = ref(1);
const busy = ref(false);
const error = ref("");
const sort = ref<{ key: SortKey; descending: boolean }>({
  key: "createdAt",
  descending: true,
});
const columnWidths = ref([11, 12, 34, 21, 14, 8]);
const permissionTable = useTemplateRef<HTMLElement>("permissionTable");
const resizing = ref<{
  index: number;
  startX: number;
  tableWidth: number;
  widths: number[];
}>();

const rules = computed(() =>
  actor.value ? rulesFromObjects(objects.value, actor.value) : [],
);
const sources = computed(() => {
  const unique = new Map<string, Source>();
  if (props.initialSource) unique.set(props.initialSource.key, props.initialSource);
  for (const rule of rules.value) {
    const source = accessRuleSource(rule);
    if (!unique.has(source.key)) unique.set(source.key, source);
  }
  return [...unique.values()].sort((left, right) =>
    sourceLabel(left).localeCompare(sourceLabel(right)),
  );
});
const filteredRules = computed(() =>
  rules.value.filter(
    (rule) =>
      !selectedSources.value.length ||
      selectedSources.value.includes(accessRuleSource(rule).key),
  ),
);
const sortedRules = computed(() => {
  const direction = sort.value.descending ? -1 : 1;
  return [...filteredRules.value].sort((left, right) => {
    const a = accessRuleSortValue(left, sort.value.key);
    const b = accessRuleSortValue(right, sort.value.key);
    return (
      direction *
      (typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b)))
    );
  });
});
const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredRules.value.length / PAGE_SIZE)),
);
const pagedRules = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return sortedRules.value.slice(start, start + PAGE_SIZE);
});
const loading = computed(
  () =>
    session.value === undefined ||
    Boolean(activeSession.value && isFirstPoll.value),
);
const gridStyle = computed(() => ({
  gridTemplateColumns: columnWidths.value
    .map((width) => `${width}%`)
    .join(" "),
}));

watch(
  selectedSources,
  () => {
    page.value = 1;
    const url = new URL(window.location.href);
    url.searchParams.delete("source");
    url.searchParams.delete("site");
    for (const source of selectedSources.value) {
      url.searchParams.append("site", source);
    }
    window.history.replaceState(window.history.state, "", url);
  },
  { deep: true },
);
watch(pageCount, (count) => (page.value = Math.min(page.value, count)));

async function run(operation: () => Promise<unknown>) {
  busy.value = true;
  error.value = "";
  try {
    await operation();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function signIn() {
  return graffiti.login(props.initialActor);
}

function revoke(rule: AccessRule) {
  const currentSession = activeSession.value;
  if (!currentSession) return;
  return run(() => graffiti.delete(ruleId(rule), currentSession));
}

async function revokeShown() {
  const currentSession = activeSession.value;
  if (!currentSession || !filteredRules.value.length) return;
  const count = filteredRules.value.length;
  if (!confirm(`Revoke ${count} permission${count === 1 ? "" : "s"}?`)) return;
  await run(async () => {
    for (const rule of filteredRules.value) {
      await graffiti.delete(ruleId(rule), currentSession);
    }
  });
}

function clearSelections() {
  selectedSources.value = [];
}

function sourceCount(key: string) {
  return rules.value.filter((rule) => accessRuleSource(rule).key === key).length;
}

function accessRuleSource(rule: AccessRule) {
  return rule.kind === "permission" ? rule.permission.source : rule.block.source;
}

function accessRulePublished(rule: AccessRule) {
  return rule.kind === "permission"
    ? rule.permission.createdAt
    : rule.block.createdAt;
}

function accessRuleDecision(rule: AccessRule) {
  if (rule.kind === "site-block") return "Deny";
  return rule.permission.decision === "allow" ? "Allow" : "Deny";
}

function accessRuleAction(rule: AccessRule) {
  if (rule.kind === "site-block") return "All requests";
  return (
    ({
      post: "Create",
      get: "Read",
      delete: "Delete",
      postMedia: "Upload",
      getMedia: "View",
      deleteMedia: "Delete",
      logout: "Log out",
    } as Record<string, string>)[rule.permission.method] ?? rule.permission.method
  );
}

function accessRuleDataLabel(rule: AccessRule) {
  if (rule.kind === "site-block") return "Everything from this site";
  const permission = rule.permission;
  const match = permission.match;
  if (match.kind === "logout") return "Session";
  if ("url" in match) return match.url;
  return JSON.stringify(match.example);
}

function accessRuleSortValue(rule: AccessRule, key: SortKey) {
  if (key === "decision") return accessRuleDecision(rule);
  if (key === "action") return accessRuleAction(rule);
  if (key === "data") return accessRuleDataLabel(rule);
  if (key === "source") return sourceLabel(accessRuleSource(rule));
  return accessRulePublished(rule);
}

function changeSort(key: SortKey) {
  if (!key) return;
  sort.value = {
    key,
    descending: sort.value.key === key ? !sort.value.descending : false,
  };
  page.value = 1;
}

function sortIndicator(key: SortKey) {
  if (sort.value.key !== key) return "";
  return sort.value.descending ? "↓" : "↑";
}

function resizerStyle(index: number) {
  const left = columnWidths.value
    .slice(0, index + 1)
    .reduce((sum, width) => sum + width, 0);
  return { left: `${left}%` };
}

function startResize(event: PointerEvent, index: number) {
  event.preventDefault();
  if (!permissionTable.value) return;
  resizing.value = {
    index,
    startX: event.clientX,
    tableWidth: permissionTable.value.getBoundingClientRect().width,
    widths: [...columnWidths.value],
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function resize(event: PointerEvent) {
  const state = resizing.value;
  if (!state) return;
  const widths = [...state.widths];
  const pair = widths[state.index] + widths[state.index + 1];
  const delta = ((event.clientX - state.startX) / state.tableWidth) * 100;
  widths[state.index] = Math.min(
    pair - MIN_COLUMN_WIDTH,
    Math.max(MIN_COLUMN_WIDTH, widths[state.index] + delta),
  );
  widths[state.index + 1] = pair - widths[state.index];
  columnWidths.value = widths;
}

function resizeWithKeyboard(event: KeyboardEvent, index: number) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const widths = [...columnWidths.value];
  const pair = widths[index] + widths[index + 1];
  const delta = event.key === "ArrowLeft" ? -1 : 1;
  widths[index] = Math.min(
    pair - MIN_COLUMN_WIDTH,
    Math.max(MIN_COLUMN_WIDTH, widths[index] + delta),
  );
  widths[index + 1] = pair - widths[index];
  columnWidths.value = widths;
}
</script>

<template>
  <main class="audit-page" :aria-busy="loading || busy">
    <header class="page-header">
      <a v-if="redirectUrl" class="back-link" :href="redirectUrl">
        <span aria-hidden="true">←</span> Return to site
      </a>
      <h1>Graffiti Data Guard</h1>
      <GraffitiActorToHandle v-if="actor" v-slot="{ handle }" :actor="actor">
        <p class="account">Permissions for {{ handle ?? actor }}</p>
      </GraffitiActorToHandle>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="empty" aria-live="polite">Loading permissions…</p>
    <section v-else-if="!activeSession" class="empty signed-out">
      <p>Sign in to review these permissions.</p>
      <button type="button" @click="signIn">Sign in</button>
    </section>

    <div v-else class="content-layout">
      <aside class="facets" aria-label="Filter permissions by site">
        <button
          type="button"
          class="quiet clear-facets"
          :disabled="!selectedSources.length"
          @click="clearSelections"
        >
          Clear selection
        </button>
        <fieldset>
          <legend>Sites</legend>
          <label v-for="source in sources" :key="source.key" class="facet">
            <input v-model="selectedSources" type="checkbox" :value="source.key" />
            <span class="facet-name">{{ sourceLabel(source) }}</span>
            <span class="count">{{ sourceCount(source.key) }}</span>
          </label>
        </fieldset>
      </aside>

      <section class="main-pane" aria-labelledby="permissions-heading">
        <header class="section-header">
          <h2 id="permissions-heading">
            {{ filteredRules.length }}
            {{ filteredRules.length === 1 ? "permission" : "permissions" }}
          </h2>
          <div class="section-actions">
            <button type="button" class="quiet" :disabled="busy" @click="poll">
              Refresh
            </button>
            <button
              type="button"
              class="danger quiet"
              :disabled="busy || !filteredRules.length"
              @click="revokeShown"
            >
              Revoke results
            </button>
          </div>
        </header>

        <p v-if="!filteredRules.length" class="empty">No permissions found.</p>
        <div
          v-else
          ref="permissionTable"
          class="record-table"
          role="table"
          aria-label="Permissions"
        >
          <div class="table-heading" :style="gridStyle" role="row">
            <div
              v-for="column in columns"
              :key="column[0]"
              class="heading-cell"
              role="columnheader"
            >
              <button
                v-if="column[1]"
                type="button"
                class="sort"
                @click="changeSort(column[1])"
              >
                {{ column[0] }}
                <span aria-hidden="true">{{ sortIndicator(column[1]) }}</span>
              </button>
              <span v-else class="visually-hidden">Actions</span>
            </div>
          </div>

          <article
            v-for="rule in pagedRules"
            :key="ruleId(rule)"
            class="record-row"
            :style="gridStyle"
            role="row"
          >
            <strong class="decision-cell" role="cell">
              {{ accessRuleDecision(rule) }}
            </strong>
            <span class="operation-cell" role="cell">
              {{ accessRuleAction(rule) }}
            </span>
            <span class="data-cell" role="cell">
              <PermissionDataValue
                v-if="rule.kind === 'permission'"
                :permission="rule.permission"
                :session="activeSession"
              />
              <span v-else>Entire site</span>
            </span>
            <span class="source-cell" role="cell">
              {{ sourceLabel(accessRuleSource(rule)) }}
            </span>
            <span class="time-cell" role="cell">
              <TimestampValue :value="new Date(accessRulePublished(rule))" />
            </span>
            <span class="action-cell" role="cell">
              <button
                type="button"
                class="danger compact"
                :disabled="busy || ruleActor(rule) !== activeSession.actor"
                @click="revoke(rule)"
              >
                Revoke
              </button>
            </span>
          </article>

          <button
            v-for="index in columnWidths.length - 1"
            :key="index"
            type="button"
            class="table-resizer"
            role="separator"
            aria-label="Resize table columns"
            aria-orientation="vertical"
            :aria-valuemin="MIN_COLUMN_WIDTH"
            :aria-valuemax="columnWidths[index - 1] + columnWidths[index] - MIN_COLUMN_WIDTH"
            :aria-valuenow="Math.round(columnWidths[index - 1])"
            :style="resizerStyle(index - 1)"
            @pointerdown="startResize($event, index - 1)"
            @pointermove="resize"
            @pointerup="resizing = undefined"
            @pointercancel="resizing = undefined"
            @keydown="resizeWithKeyboard($event, index - 1)"
          />
        </div>

        <nav v-if="pageCount > 1" class="pagination" aria-label="Pages">
          <button type="button" :disabled="page === 1" @click="page--">Previous</button>
          <span>Page {{ page }} of {{ pageCount }}</span>
          <button type="button" :disabled="page === pageCount" @click="page++">Next</button>
        </nav>
      </section>
    </div>
  </main>
</template>

<style scoped>
.audit-page { width: 100%; min-height: 100dvh; padding: 1.5rem max(1rem, calc((100% - 80rem) / 2)) 3rem; color: var(--text-color); background: var(--background-color); }
.page-header { display: grid; justify-items: start; gap: 0.4rem; margin-bottom: 1rem; }
.page-header h1, .page-header p, h2, p { margin: 0; }
.page-header h1 { color: var(--title-color); font-size: clamp(1.65rem, 4vw, 2.35rem); line-height: 1.1; }
.account { color: var(--secondary-color); font-size: 0.9rem; }
.back-link { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--secondary-color); font-size: 0.85rem; }
.back-link:hover { color: var(--link-hover-color); }
button { border: 1px solid var(--border-color); border-radius: 0.4rem; padding: 0.42rem 0.68rem; color: var(--text-color); background: var(--background-color-interactive); font: inherit; cursor: pointer; text-decoration: none; }
button:hover { border-color: var(--border-color-hover); color: var(--text-color); background: var(--background-color-interactive-hover); text-decoration: none; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.danger { color: var(--warning-color); }
button.quiet { border: 0; padding: 0.2rem; color: var(--link-color); background: transparent; }
button.quiet:hover { color: var(--link-hover-color); text-decoration: underline; }
.content-layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr); align-items: start; gap: 1.5rem; }
.facets { position: sticky; top: 1rem; display: grid; gap: 1rem; border-right: 1px solid var(--border-color); padding: 0.65rem 1.25rem 0 0; }
.facets fieldset { display: grid; gap: 0.12rem; min-width: 0; border: 0; }
.facets legend { margin-bottom: 0.35rem; color: var(--secondary-color); font-size: 0.78rem; font-weight: 750; letter-spacing: 0.05em; text-transform: uppercase; }
.facet { display: grid; grid-template-columns: 1rem minmax(0, 1fr) auto; align-items: center; gap: 0.45rem; min-width: 0; border-radius: 0.3rem; padding: 0.32rem 0.25rem; cursor: pointer; }
.facet:hover { background: var(--background-color-interactive); }
.facet input { width: 1rem; height: 1rem; accent-color: var(--accent-button-background); }
.facet-name { min-width: 0; font-size: 0.88rem; line-height: 1.25; overflow-wrap: anywhere; }
.count { color: var(--secondary-color); font-size: 0.78rem; }
.main-pane { min-width: 0; }
.section-header { display: flex; min-height: 2rem; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.55rem; }
.section-header h2 { color: var(--title-color); font-size: 1rem; }
.section-actions { display: flex; gap: 0.8rem; }
.record-table { position: relative; border: 1px solid var(--border-color); border-radius: 0.55rem; }
.table-heading, .record-row { display: grid; align-items: stretch; }
.table-heading { position: sticky; top: 0; z-index: 3; border-bottom: 1px solid var(--border-color); border-radius: 0.5rem 0.5rem 0 0; color: var(--secondary-color); background: color-mix(in srgb, var(--background-color-interactive) 88%, var(--background-color)); box-shadow: 0 1px 0 var(--border-color); font-size: 0.74rem; font-weight: 700; }
.heading-cell { position: relative; display: flex; min-width: 0; align-items: center; }
.heading-cell:not(:last-child), .record-row > *:not(:last-child) { border-right: 1px solid color-mix(in srgb, var(--border-color) 75%, transparent); }
.sort { width: 100%; border: 0; border-radius: 0; padding: 0.48rem 0.65rem; color: inherit; background: transparent; font-size: inherit; font-weight: inherit; text-align: left; }
.sort:hover { color: var(--text-color); background: var(--background-color-interactive-hover); }
.sort span { display: inline-block; width: 0.8rem; }
.table-resizer, .table-resizer:hover, .table-resizer:focus-visible { position: absolute; top: 0; bottom: 0; z-index: 4; width: 0.85rem; transform: translateX(-50%); border: 0; border-radius: 0; padding: 0; color: transparent; background: transparent; box-shadow: none; cursor: col-resize; touch-action: none; }
.table-resizer::after { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; transform: translateX(-50%); background: transparent; content: ""; }
.table-resizer:hover::after, .table-resizer:active::after, .table-resizer:focus-visible::after { background: color-mix(in srgb, var(--text-color) 55%, var(--border-color)); }
.record-row { min-height: 3.15rem; background: var(--background-color); }
.record-row:nth-of-type(even) { background: color-mix(in srgb, var(--background-color-interactive) 48%, var(--background-color)); }
.record-row + .record-row { border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent); }
.record-row > * { display: flex; min-width: 0; align-items: center; padding: 0.45rem 0.65rem; font-size: 0.84rem; overflow-wrap: anywhere; }
.decision-cell { color: var(--title-color); font-size: 0.86rem; }
.data-cell, .time-cell { overflow: visible; }
.source-cell, .time-cell { color: var(--secondary-color); }
.action-cell { justify-content: flex-end; }
button.compact { padding: 0.3rem 0.48rem; font-size: 0.78rem; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 0.8rem; margin-top: 1rem; color: var(--secondary-color); font-size: 0.85rem; }
.pagination button { padding: 0.35rem 0.6rem; }
.empty { margin: 1rem 0; border: 1px dashed var(--border-color); border-radius: 0.5rem; padding: 1.5rem; color: var(--secondary-color); text-align: center; }
.signed-out { display: grid; justify-items: center; gap: 1rem; }
.error { margin-bottom: 0.75rem; color: var(--warning-color); }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@media (max-width: 46rem) {
  .content-layout { grid-template-columns: 1fr; }
  .facets { position: static; border-right: 0; border-bottom: 1px solid var(--border-color); padding: 0 0 1rem; }
  .table-heading, .table-resizer { display: none; }
  .record-row { grid-template-columns: minmax(0, 1fr) auto !important; gap: 0.2rem 0.6rem; padding: 0.65rem; }
  .record-row > * { border-right: 0 !important; padding: 0.1rem 0; }
  .decision-cell { grid-column: 1; grid-row: 1; }
  .operation-cell { grid-column: 1; grid-row: 2; color: var(--secondary-color); }
  .data-cell { grid-column: 1; grid-row: 3; }
  .source-cell { grid-column: 1; grid-row: 4; }
  .time-cell { grid-column: 1; grid-row: 5; }
  .action-cell { grid-column: 2; grid-row: 1 / 6; align-self: center; padding-left: 0.75rem; }
}
</style>
