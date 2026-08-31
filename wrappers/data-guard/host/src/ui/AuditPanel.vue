<script setup lang="ts">
import { GraffitiActorToHandle } from "@graffiti-garden/wrapper-vue";
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import type { Permission, Request } from "../core/db.js";
import type { Guard } from "../core/guard.js";
import { sourceLabel } from "../core/source.js";
import { mediaLabels } from "./media.js";
import GraffitiLinkValue from "./values/GraffitiLinkValue.vue";
import IdentityValue from "./values/IdentityValue.vue";
import TimestampValue from "./values/TimestampValue.vue";

const PAGE_SIZE = 100;

const props = defineProps<{
  guard: Guard;
  initialSource?: Permission["source"];
  initialActor?: string;
  redirectUrl?: string;
}>();

type HistoryEntry = Awaited<ReturnType<Guard["audit"]>>["requests"][number];
type TableKind = "activity" | "permissions";
type SortState = { key: string; descending: boolean };

const requestedView = new URL(window.location.href).searchParams.get("view");
const tab = ref<TableKind>(requestedView === "permissions" ? "permissions" : "activity");
const permissions = ref<Permission[]>([]);
const history = ref<HistoryEntry[]>([]);
const urlSites = window.location.search
  ? new URL(window.location.href).searchParams.getAll("site").filter(Boolean)
  : [];
const urlIdentities = window.location.search
  ? new URL(window.location.href).searchParams.getAll("identity").filter(Boolean)
  : [];
const selectedSources = ref<string[]>(
  urlSites.length
    ? urlSites
    : props.initialSource
      ? [props.initialSource.key]
      : [],
);
const selectedActors = ref<string[]>(
  urlIdentities.length
    ? urlIdentities
    : props.initialActor
      ? [props.initialActor]
      : [],
);
const page = ref(1);
const activitySort = ref<SortState>({ key: "createdAt", descending: true });
const permissionSort = ref<SortState>({ key: "createdAt", descending: true });
const activityWidths = ref([18, 20, 18, 18, 14, 12]);
const permissionWidths = ref([21, 23, 18, 18, 13, 7]);
const activityTable = useTemplateRef<HTMLElement>("activityTable");
const permissionTable = useTemplateRef<HTMLElement>("permissionTable");
const resizing = ref<{
  kind: TableKind;
  index: number;
  startX: number;
  tableWidth: number;
  widths: number[];
}>();
const loading = ref(true);
const busy = ref(false);
const error = ref("");

const activity = computed(() =>
  history.value.filter(({ result }) => result?.execution?.ok === true),
);

const sources = computed(() => {
  const values = [
    ...(props.initialSource ? [props.initialSource] : []),
    ...permissions.value.map(({ source }) => source),
    ...activity.value.map(({ request }) => request.source),
  ];
  const unique = new Map<string, Permission["source"]>();
  for (const item of values) {
    if (!unique.has(item.key)) unique.set(item.key, item);
  }
  return [...unique.values()].sort((left, right) =>
    sourceLabel(left).localeCompare(sourceLabel(right)),
  );
});

const actors = computed(() =>
  [
    ...new Set([
      ...(props.initialActor ? [props.initialActor] : []),
      ...permissions.value.map(({ actor }) => actor),
      ...activity.value.map(({ request }) => request.actor),
    ]),
  ].sort(),
);

const filteredActivity = computed(() =>
  activity.value.filter(({ request }) => matchesFacets(request)),
);
const filteredPermissions = computed(() =>
  permissions.value.filter(matchesFacets),
);
const hasFacets = computed(
  () => selectedSources.value.length > 0 || selectedActors.value.length > 0,
);
const sortedActivity = computed(() =>
  sorted(filteredActivity.value, activitySort.value, activitySortValue),
);
const sortedPermissions = computed(() =>
  sorted(
    filteredPermissions.value,
    permissionSort.value,
    permissionSortValue,
  ),
);
const pagedActivity = computed(() => paginate(sortedActivity.value));
const pagedPermissions = computed(() => paginate(sortedPermissions.value));
const resultCount = computed(() =>
  tab.value === "activity"
    ? filteredActivity.value.length
    : filteredPermissions.value.length,
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(resultCount.value / PAGE_SIZE)),
);

watch(
  [selectedSources, selectedActors],
  () => {
    page.value = 1;
    syncFacetUrl();
  },
  { deep: true },
);
watch(pageCount, (count) => (page.value = Math.min(page.value, count)));
onMounted(() => void load());

async function load() {
  try {
    const audit = await props.guard.audit();
    permissions.value = audit.permissions;
    history.value = audit.requests;
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

function selectTab(value: TableKind) {
  tab.value = value;
  page.value = 1;
  const url = new URL(window.location.href);
  url.searchParams.set("view", value);
  window.history.replaceState(window.history.state, "", url);
}

function matchesFacets(value: { source: Permission["source"]; actor: string }) {
  return (
    (!selectedSources.value.length ||
      selectedSources.value.includes(value.source.key)) &&
    (!selectedActors.value.length ||
      selectedActors.value.includes(value.actor))
  );
}

function clearFacets() {
  selectedSources.value = [];
  selectedActors.value = [];
}

function syncFacetUrl() {
  const url = new URL(window.location.href);
  // Once the user changes the selection, replace the legacy single-value
  // launch filters with the shareable multi-value facet parameters.
  url.searchParams.delete("source");
  url.searchParams.delete("actor");
  url.searchParams.delete("site");
  url.searchParams.delete("identity");
  for (const site of selectedSources.value) {
    url.searchParams.append("site", site);
  }
  for (const identity of selectedActors.value) {
    url.searchParams.append("identity", identity);
  }
  window.history.replaceState(window.history.state, "", url);
}

function sourceCount(key: string) {
  return tab.value === "activity"
    ? activity.value.filter(({ request }) => request.source.key === key).length
    : permissions.value.filter(({ source }) => source.key === key).length;
}

function actorCount(actor: string) {
  return tab.value === "activity"
    ? activity.value.filter(({ request }) => request.actor === actor).length
    : permissions.value.filter((permission) => permission.actor === actor).length;
}

function paginate<T>(values: T[]) {
  const start = (page.value - 1) * PAGE_SIZE;
  return values.slice(start, start + PAGE_SIZE);
}

function sorted<T>(
  values: T[],
  state: SortState,
  valueFor: (value: T, key: string) => string | number,
) {
  const direction = state.descending ? -1 : 1;
  return [...values].sort((left, right) => {
    const a = valueFor(left, state.key);
    const b = valueFor(right, state.key);
    return (
      direction *
      (typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b)))
    );
  });
}

function activitySortValue(entry: HistoryEntry, key: string) {
  const request = entry.request;
  if (key === "action") return requestAction(request);
  if (key === "item") return itemLabel(request);
  if (key === "source") return sourceLabel(request.source);
  if (key === "actor") return request.actor;
  return request.createdAt;
}

function permissionSortValue(permission: Permission, key: string) {
  if (key === "permission") return permissionAction(permission);
  if (key === "scope") return permissionScope(permission);
  if (key === "source") return sourceLabel(permission.source);
  if (key === "actor") return permission.actor;
  return permission.createdAt;
}

function changeSort(kind: TableKind, key: string) {
  const state = kind === "activity" ? activitySort : permissionSort;
  state.value = {
    key,
    descending: state.value.key === key ? !state.value.descending : false,
  };
  page.value = 1;
}

function sortIndicator(kind: TableKind, key: string) {
  const state = kind === "activity" ? activitySort.value : permissionSort.value;
  if (state.key !== key) return "";
  return state.descending ? "↓" : "↑";
}

function widthsFor(kind: TableKind) {
  return kind === "activity" ? activityWidths.value : permissionWidths.value;
}

function gridStyle(kind: TableKind) {
  return {
    gridTemplateColumns: widthsFor(kind)
      .map((width) => `${width}%`)
      .join(" "),
  };
}

function resizerStyle(kind: TableKind, index: number) {
  const left = widthsFor(kind)
    .slice(0, index + 1)
    .reduce((sum, width) => sum + width, 0);
  return { left: `${left}%` };
}

function startResize(event: PointerEvent, kind: TableKind, index: number) {
  event.preventDefault();
  const table = kind === "activity" ? activityTable.value : permissionTable.value;
  if (!table) return;
  resizing.value = {
    kind,
    index,
    startX: event.clientX,
    tableWidth: table.getBoundingClientRect().width,
    widths: [...widthsFor(kind)],
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
    pair - 6,
    Math.max(6, widths[state.index] + delta),
  );
  widths[state.index + 1] = pair - widths[state.index];
  if (state.kind === "activity") activityWidths.value = widths;
  else permissionWidths.value = widths;
}

function resizeWithKeyboard(
  event: KeyboardEvent,
  kind: TableKind,
  index: number,
) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const target = kind === "activity" ? activityWidths : permissionWidths;
  const widths = [...target.value];
  const pair = widths[index] + widths[index + 1];
  const delta = event.key === "ArrowLeft" ? -1 : 1;
  widths[index] = Math.min(pair - 6, Math.max(6, widths[index] + delta));
  widths[index + 1] = pair - widths[index];
  target.value = widths;
}

async function run(operation: () => Promise<unknown>) {
  busy.value = true;
  error.value = "";
  try {
    await operation();
    await load();
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

function revoke(permission: Permission) {
  return run(() => props.guard.revoke(permission.id));
}

async function revokeShown() {
  const count = filteredPermissions.value.length;
  if (!confirm(`Revoke ${count} permission${count === 1 ? "" : "s"}?`)) return;
  await run(async () => {
    for (const permission of filteredPermissions.value) {
      await props.guard.revoke(permission.id);
    }
  });
}

async function recover(request: Request) {
  const warning =
    request.method === "delete"
      ? "Restore this item? It will get a new link."
      : "Undo this activity?";
  if (confirm(warning)) await run(() => props.guard.recover(request.id));
}

async function clearHistory() {
  if (confirm("Clear all activity? Permissions will stay in place.")) {
    await run(() => props.guard.clearHistory());
  }
}

async function clearEverything() {
  if (confirm("Remove all permissions and activity?")) {
    await run(() => props.guard.clearEverything());
  }
}

function isReversible(request: Request) {
  return ["post", "postMedia", "delete"].includes(request.method);
}

function wasRecovered(request: Request) {
  return history.value.some(({ request: item }) => item.undoOf === request.id);
}

function canRecover(request: Request) {
  return (
    isReversible(request) &&
    props.guard.hasSession(request.actor) &&
    !wasRecovered(request)
  );
}

function recoveryLabel(request: Request) {
  if (wasRecovered(request)) return "Undone";
  return request.method === "delete" ? "Restore" : "Undo";
}

function recoveryTitle(request: Request) {
  if (wasRecovered(request)) return "This activity has already been undone";
  if (!props.guard.hasSession(request.actor)) {
    return "Sign in as this identity to undo this activity";
  }
}

function requestAction(request: Request) {
  const subject = request.subject as any;
  if (subject?.kind === "media") {
    return `${mediaVerb(request.method)} ${fileNoun(subject.type)}`;
  }
  return (
    ({
      post: "Post data",
      get: "Access data",
      delete: "Delete data",
      logout: "Log out",
    } as Record<string, string>)[request.method] ?? request.method
  );
}

function permissionAction(permission: Permission) {
  const match = permission.match;
  if (match.kind === "media") {
    const kind =
      "mediaType" in match && match.mediaType.startsWith("kind:")
        ? match.mediaType.slice(5).toLowerCase()
        : "file";
    return `${mediaVerb(permission.method)} ${nounWithArticle(kind === "file" ? "file" : `${kind} file`)}`;
  }
  return (
    ({
      post: "Post data",
      get: "Access data",
      delete: "Delete data",
      logout: "Log out",
    } as Record<string, string>)[permission.method] ?? permission.method
  );
}

function mediaVerb(method: string) {
  return method === "postMedia" ? "Store" : method === "getMedia" ? "Access" : "Delete";
}

function fileNoun(type: unknown) {
  const item = String(mediaLabels(type).item).toLowerCase();
  return nounWithArticle(item === "file" ? "file" : `${item} file`);
}

function nounWithArticle(noun: string) {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

function itemLabel(request: Request) {
  const subject = request.subject as any;
  if (request.method === "logout") return "Session";
  if (subject?.kind === "media") return subject.name || fileNoun(subject.type);
  const value = subject?.object?.value;
  return value?.type ?? value?.["@type"] ?? value?.activity ?? "Item";
}

function permissionScope(permission: Permission) {
  const match = permission.match;
  if (match.kind === "logout") return "Account session";
  if ("url" in match) return match.kind === "media" ? "One file" : "One item";
  if (match.kind === "media") return visibilityLabel(match.allowed);
  const kind = objectSchemaKind(match.schema);
  const collection = collectionLabel(match.channels);
  return `${kind} · ${collection} · ${visibilityLabel(match.allowed)}`;
}

function objectSchemaKind(schema: unknown) {
  const properties = (schema as any)?.properties;
  const kind =
    properties?.type?.const ??
    properties?.["@type"]?.const ??
    properties?.activity?.const;
  return typeof kind === "string" ? `${kind} data` : "Similar data";
}

function collectionLabel(value: string[] | "any") {
  if (value === "any") return "Any collection";
  if (!value.length) return "No collection";
  return value.length === 1 ? "1 collection" : `${value.length} collections`;
}

function visibilityLabel(value: string[] | "any") {
  if (value === "any") return "Any sharing setting";
  if (!value.length) return "Only you";
  return `Shared with ${value.length} ${value.length === 1 ? "identity" : "identities"}`;
}

function resourceUrl(entry: HistoryEntry) {
  const subject = entry.request.subject as any;
  const result = entry.result?.execution;
  if (subject?.kind === "object" && subject.object?.url) return subject.object.url;
  if (subject?.kind === "media" && subject.url) return subject.url;
  if (result?.ok && typeof (result.value as any)?.url === "string") {
    return (result.value as any).url;
  }
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
</script>

<template>
  <main class="audit-page" :aria-busy="loading || busy">
    <header class="page-header">
      <a v-if="redirectUrl" class="back-link" :href="redirectUrl">
        <span aria-hidden="true">←</span> Return to site
      </a>
      <h1>Graffiti Data Guard</h1>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="empty" aria-live="polite">Loading…</p>

    <div v-else class="content-layout">
      <aside class="facets" aria-label="Refine results">
        <button
          type="button"
          class="quiet clear-facets"
          :disabled="!hasFacets"
          @click="clearFacets"
        >
          Clear selections
        </button>

        <fieldset>
          <legend>Sites</legend>
          <label v-for="item in sources" :key="item.key" class="facet">
            <input v-model="selectedSources" type="checkbox" :value="item.key" />
            <span class="facet-name">{{ sourceLabel(item) }}</span>
            <span class="count">{{ sourceCount(item.key) }}</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Identities</legend>
          <label v-for="item in actors" :key="item" class="facet">
            <input v-model="selectedActors" type="checkbox" :value="item" />
            <GraffitiActorToHandle v-slot="{ handle }" :actor="item">
              <span class="facet-name">{{ handle ?? "Unknown identity" }}</span>
            </GraffitiActorToHandle>
            <span class="count">{{ actorCount(item) }}</span>
          </label>
        </fieldset>
      </aside>

      <div class="main-pane">
        <nav class="tabs" aria-label="Data Guard views">
          <button
            type="button"
            :aria-current="tab === 'activity' ? 'page' : undefined"
            @click="selectTab('activity')"
          >
            Activity <span>{{ filteredActivity.length }}</span>
          </button>
          <button
            type="button"
            :aria-current="tab === 'permissions' ? 'page' : undefined"
            @click="selectTab('permissions')"
          >
            Permissions <span>{{ filteredPermissions.length }}</span>
          </button>
        </nav>

        <section v-if="tab === 'activity'" aria-labelledby="activity-heading">
          <header class="section-header">
            <h2 id="activity-heading">
              {{ filteredActivity.length }}
              {{ filteredActivity.length === 1 ? "activity" : "activities" }}
            </h2>
            <button
              type="button"
              class="quiet"
              :disabled="busy || !activity.length"
              @click="clearHistory"
            >
              Clear activity
            </button>
          </header>

          <p v-if="!filteredActivity.length" class="empty">No activity found.</p>
          <div v-else ref="activityTable" class="record-table" role="table" aria-label="Activity">
            <div class="table-heading" :style="gridStyle('activity')" role="row">
              <div
                v-for="column in [
                  ['Action', 'action'],
                  ['Item', 'item'],
                  ['Site', 'source'],
                  ['Identity', 'actor'],
                  ['When', 'createdAt'],
                  ['', ''],
                ]"
                :key="column[0]"
                class="heading-cell"
                role="columnheader"
              >
                <button
                  v-if="column[1]"
                  type="button"
                  class="sort"
                  @click="changeSort('activity', column[1])"
                >
                  {{ column[0] }}
                  <span>{{ sortIndicator('activity', column[1]) }}</span>
                </button>
                <span v-else class="visually-hidden">Actions</span>
              </div>
            </div>

            <article
              v-for="entry in pagedActivity"
              :key="entry.request.id"
              class="record-row"
              :style="gridStyle('activity')"
              role="row"
            >
              <strong role="cell">{{ requestAction(entry.request) }}</strong>
              <span class="item-cell" role="cell">
                <GraffitiLinkValue v-if="resourceUrl(entry)" :url="resourceUrl(entry)!" lazy />
                <span v-else>{{ itemLabel(entry.request) }}</span>
              </span>
              <span class="source-cell" role="cell">{{ sourceLabel(entry.request.source) }}</span>
              <span class="identity-cell" role="cell"><IdentityValue :actor="entry.request.actor" /></span>
              <span class="time-cell" role="cell"><TimestampValue :value="new Date(entry.request.createdAt)" /></span>
              <span class="action-cell" role="cell">
                <button
                  v-if="isReversible(entry.request)"
                  type="button"
                  class="undo-action compact"
                  :disabled="busy || !canRecover(entry.request)"
                  :title="recoveryTitle(entry.request)"
                  @click="recover(entry.request)"
                >
                  <span aria-hidden="true">↶</span>
                  {{ recoveryLabel(entry.request) }}
                </button>
              </span>
            </article>
            <button
              v-for="index in 5"
              :key="index"
              type="button"
              class="table-resizer"
              role="separator"
              aria-label="Resize column"
              aria-orientation="vertical"
              :style="resizerStyle('activity', index - 1)"
              @pointerdown="startResize($event, 'activity', index - 1)"
              @pointermove="resize"
              @pointerup="resizing = undefined"
              @pointercancel="resizing = undefined"
              @keydown="resizeWithKeyboard($event, 'activity', index - 1)"
            />
          </div>
        </section>

        <section v-else aria-labelledby="permissions-heading">
          <header class="section-header">
            <h2 id="permissions-heading">
              {{ filteredPermissions.length }}
              {{ filteredPermissions.length === 1 ? "permission" : "permissions" }}
            </h2>
            <button
              type="button"
              class="danger quiet"
              :disabled="busy || !filteredPermissions.length"
              @click="revokeShown"
            >
              Revoke results
            </button>
          </header>

          <p v-if="!filteredPermissions.length" class="empty">No permissions found.</p>
          <div v-else ref="permissionTable" class="record-table" role="table" aria-label="Permissions">
            <div class="table-heading" :style="gridStyle('permissions')" role="row">
              <div
                v-for="column in [
                  ['Permission', 'permission'],
                  ['Item or scope', 'scope'],
                  ['Site', 'source'],
                  ['Identity', 'actor'],
                  ['Added', 'createdAt'],
                  ['', ''],
                ]"
                :key="column[0]"
                class="heading-cell"
                role="columnheader"
              >
                <button
                  v-if="column[1]"
                  type="button"
                  class="sort"
                  @click="changeSort('permissions', column[1])"
                >
                  {{ column[0] }}
                  <span>{{ sortIndicator('permissions', column[1]) }}</span>
                </button>
                <span v-else class="visually-hidden">Actions</span>
              </div>
            </div>

            <article
              v-for="permission in pagedPermissions"
              :key="permission.id"
              class="record-row"
              :style="gridStyle('permissions')"
              role="row"
            >
              <strong role="cell">{{ permissionAction(permission) }}</strong>
              <span class="item-cell" role="cell">
                <GraffitiLinkValue v-if="'url' in permission.match" :url="permission.match.url" lazy />
                <span v-else>{{ permissionScope(permission) }}</span>
              </span>
              <span class="source-cell" role="cell">{{ sourceLabel(permission.source) }}</span>
              <span class="identity-cell" role="cell"><IdentityValue :actor="permission.actor" /></span>
              <span class="time-cell" role="cell"><TimestampValue :value="new Date(permission.createdAt)" /></span>
              <span class="action-cell" role="cell">
                <button type="button" class="danger compact" :disabled="busy" @click="revoke(permission)">
                  Revoke
                </button>
              </span>
            </article>
            <button
              v-for="index in 5"
              :key="index"
              type="button"
              class="table-resizer"
              role="separator"
              aria-label="Resize column"
              aria-orientation="vertical"
              :style="resizerStyle('permissions', index - 1)"
              @pointerdown="startResize($event, 'permissions', index - 1)"
              @pointermove="resize"
              @pointerup="resizing = undefined"
              @pointercancel="resizing = undefined"
              @keydown="resizeWithKeyboard($event, 'permissions', index - 1)"
            />
          </div>
        </section>

        <nav v-if="pageCount > 1" class="pagination" aria-label="Pages">
          <button type="button" :disabled="page === 1" @click="page--">Previous</button>
          <span>Page {{ page }} of {{ pageCount }}</span>
          <button type="button" :disabled="page === pageCount" @click="page++">Next</button>
        </nav>
      </div>
    </div>

    <footer v-if="!loading" class="page-actions">
      <button type="button" class="danger quiet" :disabled="busy" @click="clearEverything">
        Reset Data Guard
      </button>
    </footer>
  </main>
</template>

<style scoped>
.audit-page { width: 100%; min-height: 100dvh; padding: 1.5rem max(1rem, calc((100% - 80rem) / 2)) 3rem; color: var(--text-color); background: var(--background-color); }
.page-header { display: grid; justify-items: start; gap: 0.55rem; margin-bottom: 1rem; }
.page-header h1 { margin: 0; color: var(--title-color); font-size: clamp(1.65rem, 4vw, 2.35rem); line-height: 1.1; }
.back-link { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--secondary-color); font-size: 0.85rem; }
.back-link:hover { color: var(--link-hover-color); }
h2, p { margin: 0; }
h2 { color: var(--title-color); font-size: 1rem; }
button { border: 1px solid var(--border-color); border-radius: 0.4rem; padding: 0.42rem 0.68rem; color: var(--text-color); background: var(--background-color-interactive); font: inherit; cursor: pointer; text-decoration: none; }
button:hover { border-color: var(--border-color-hover); color: var(--text-color); background: var(--background-color-interactive-hover); text-decoration: none; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.danger { color: var(--warning-color); }
button.quiet { border: 0; padding: 0.2rem; color: var(--link-color); background: transparent; }
button.quiet:hover { color: var(--link-hover-color); text-decoration: underline; }
button.quiet:disabled, button.quiet:disabled:hover { color: var(--secondary-color); background: transparent; text-decoration: none; }
.content-layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr); align-items: start; gap: 1.5rem; }
.main-pane { min-width: 0; }
.tabs { display: flex; gap: 1.25rem; margin-bottom: 1.1rem; border-bottom: 1px solid var(--border-color); }
.tabs button { margin-bottom: -1px; border: 0; border-bottom: 3px solid transparent; border-radius: 0; padding: 0.65rem 0.1rem; color: var(--secondary-color); background: transparent; font-weight: 650; }
.tabs button:hover { color: var(--text-color); background: transparent; }
.tabs button[aria-current="page"] { border-bottom-color: var(--accent-button-background); color: var(--title-color); }
.tabs span, .count { color: var(--secondary-color); font-size: 0.78rem; font-weight: 500; }
.tabs span { margin-left: 0.2rem; }
.facets { position: sticky; top: 1rem; display: grid; gap: 1rem; border-right: 1px solid var(--border-color); padding: 0.65rem 1.25rem 0 0; }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.clear-facets { justify-self: start; }
.facets fieldset { display: grid; gap: 0.12rem; min-width: 0; border: 0; }
.facets legend { margin-bottom: 0.35rem; color: var(--secondary-color); font-size: 0.78rem; font-weight: 750; letter-spacing: 0.05em; text-transform: uppercase; }
.facet { display: grid; grid-template-columns: 1rem minmax(0, 1fr) auto; align-items: center; gap: 0.45rem; min-width: 0; border-radius: 0.3rem; padding: 0.32rem 0.25rem; cursor: pointer; }
.facet:hover { background: var(--background-color-interactive); }
.facet input { width: 1rem; height: 1rem; accent-color: var(--accent-button-background); }
.facet-name { min-width: 0; font-size: 0.88rem; line-height: 1.25; overflow-wrap: anywhere; }
.section-header { min-height: 2rem; margin-bottom: 0.55rem; }
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
.record-row { min-height: 3.15rem; }
.record-row:nth-of-type(odd) { background: var(--background-color); }
.record-row:nth-of-type(even) { background: color-mix(in srgb, var(--background-color-interactive) 48%, var(--background-color)); }
.record-row + .record-row { border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent); }
.record-row > * { display: flex; min-width: 0; align-items: center; padding: 0.45rem 0.65rem; font-size: 0.84rem; overflow-wrap: anywhere; }
.record-row strong { color: var(--title-color); font-size: 0.86rem; }
.item-cell, .identity-cell { overflow: visible; }
.source-cell, .time-cell { color: var(--secondary-color); }
.action-cell { justify-content: flex-end; }
button.compact { padding: 0.3rem 0.48rem; font-size: 0.78rem; }
button.undo-action { display: inline-flex; align-items: center; gap: 0.28rem; border-color: var(--accent-button-background); color: var(--accent-button-text); background: var(--accent-button-background); font-weight: 700; white-space: nowrap; }
button.undo-action:hover { border-color: var(--accent-button-background-hover); color: var(--accent-button-text); background: var(--accent-button-background-hover); }
.pagination { display: flex; align-items: center; justify-content: center; gap: 0.8rem; margin-top: 1rem; color: var(--secondary-color); font-size: 0.85rem; }
.pagination button { padding: 0.35rem 0.6rem; }
.empty { margin: 1rem 0; border: 1px dashed var(--border-color); border-radius: 0.5rem; padding: 1.5rem; color: var(--secondary-color); text-align: center; }
.error { margin-bottom: 0.75rem; color: var(--warning-color); }
.page-actions { display: flex; justify-content: flex-end; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@media (max-width: 46rem) {
  .audit-page { padding-top: 1rem; }
  .content-layout { grid-template-columns: 1fr; gap: 1rem; }
  .facets { position: static; grid-template-columns: 1fr 1fr; border-right: 0; border-bottom: 1px solid var(--border-color); padding: 0 0 1rem; }
  .clear-facets { grid-column: 1 / -1; }
  .table-heading { display: none; }
  .table-resizer { display: none; }
  .record-row { grid-template-columns: minmax(0, 1fr) auto !important; gap: 0.2rem 0.6rem; padding: 0.55rem 0.65rem; }
  .record-row > * { padding: 0.1rem 0; }
  .record-row > *:not(:last-child) { border-right: 0; }
  .record-row > strong { grid-column: 1; grid-row: 1; }
  .record-row > .item-cell { grid-column: 1; grid-row: 2; }
  .record-row > .source-cell { grid-column: 1; grid-row: 3; }
  .record-row > .identity-cell { grid-column: 1; grid-row: 4; }
  .record-row > .time-cell { grid-column: 2; grid-row: 2; justify-self: end; }
  .record-row > .action-cell { grid-column: 2; grid-row: 1 / 5; align-self: center; }
}

@media (max-width: 32rem) {
  .facets { grid-template-columns: 1fr; }
  .clear-facets { grid-column: 1; }
  .section-header { align-items: flex-start; }
}
</style>
