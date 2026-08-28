<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Permission, Request } from "../core/db.js";
import type { Guard } from "../core/guard.js";
import { sourceLabel } from "../core/source.js";
import IdentityValue from "./values/IdentityValue.vue";
import TimestampValue from "./values/TimestampValue.vue";
import UuidValue from "./values/UuidValue.vue";

const props = defineProps<{
  guard: Guard;
  initialSource?: Permission["source"];
  initialActor?: string;
  redirectUrl?: string;
}>();

const tab = ref<"permissions" | "history">("permissions");
const permissions = ref<Permission[]>([]);
const history = ref<Awaited<ReturnType<Guard["audit"]>>["requests"]>([]);
const source = ref(props.initialSource?.key ?? "");
const actor = ref(props.initialActor ?? "");
const loading = ref(true);
const busy = ref(false);
const error = ref("");

const sources = computed(() => {
  const values = [
    ...(props.initialSource ? [props.initialSource] : []),
    ...permissions.value.map(({ source }) => source),
    ...history.value.map(({ request }) => request.source),
  ];
  const unique = new Map<string, Permission["source"]>();
  for (const item of values) {
    // Prefer the initial or newest snapshot when a display name has changed.
    if (!unique.has(item.key)) unique.set(item.key, item);
  }
  return [...unique.values()];
});
const actors = computed(() =>
  [
    ...new Set([
      ...(props.initialActor ? [props.initialActor] : []),
      ...permissions.value.map(({ actor }) => actor),
      ...history.value.map(({ request }) => request.actor),
    ]),
  ].sort(),
);
const shownPermissions = computed(() =>
  permissions.value.filter(matchesFilter),
);
const shownHistory = computed(() =>
  history.value.filter(({ request }) => matchesFilter(request)),
);
const hasFilters = computed(() => Boolean(source.value || actor.value));

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

function matchesFilter(value: { source: Permission["source"]; actor: string }) {
  return (
    (!source.value || value.source.key === source.value) &&
    (!actor.value || value.actor === actor.value)
  );
}

function clearFilters() {
  source.value = "";
  actor.value = "";
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
  const count = shownPermissions.value.length;
  if (!confirm(`Revoke ${count} matching permission${count === 1 ? "" : "s"}?`)) {
    return;
  }
  await run(async () => {
    for (const permission of shownPermissions.value) {
      await props.guard.revoke(permission.id);
    }
  });
}

async function recover(request: Request) {
  const warning =
    request.method === "delete"
      ? "Restore this object under a new URL? Existing references will remain broken."
      : "Undo this action?";
  if (confirm(warning)) await run(() => props.guard.recover(request.id));
}

async function clearHistory() {
  if (confirm("Clear request history? Active permissions will be preserved.")) {
    await run(() => props.guard.clearHistory());
  }
}

async function clearEverything() {
  if (confirm("Revoke every permission and clear all request history?")) {
    await run(() => props.guard.clearEverything());
  }
}

function canRecover(request: Request) {
  return (
    ["post", "postMedia", "delete"].includes(request.method) &&
    props.guard.hasSession(request.actor) &&
    !history.value.some(({ request: item }) => item.undoOf === request.id)
  );
}

function methodLabel(method: string) {
  return (
    {
      post: "Store data",
      get: "Access data",
      delete: "Delete data",
      postMedia: "Store media",
      getMedia: "Access media",
      deleteMedia: "Delete media",
      logout: "Log out",
    }[method] ?? method
  );
}

function permissionSummary(permission: Permission) {
  const match = permission.match;
  if ("url" in match) return `This exact URL: ${match.url}`;
  if (match.kind === "logout") return "May end this actor's session";
  if (match.kind === "media") {
    const media = match.mediaType.startsWith("kind:")
      ? `${match.mediaType.slice(5)} files`
      : match.mediaType.slice(5);
    return `${capitalize(media)} with ${recipientScope(match.allowed)}`;
  }
  return `Matching structured data on ${scope(match.channels, "channel")} with ${recipientScope(match.allowed)}`;
}

function requestSummary(request: Request) {
  const subject = request.subject as any;
  if (subject?.kind === "media") {
    return subject.url ? `Media at ${subject.url}` : `${subject.type || "Media"}`;
  }
  if (subject?.kind === "object") {
    if (subject.object?.url) return `Data at ${subject.object.url}`;
    const value = subject.object?.value;
    const kind = value?.type ?? value?.["@type"] ?? value?.activity;
    return kind ? `${kind} data` : "Structured data";
  }
  return request.method === "logout" ? "End the active session" : "Graffiti request";
}

function status(entry: (typeof history.value)[number]) {
  if (!entry.result) return { label: "Pending", class: "pending" };
  if (!entry.result.authorization.allowed) {
    return { label: "Denied", class: "denied" };
  }
  if (!entry.result.execution) return { label: "Allowed", class: "allowed" };
  return entry.result.execution.ok
    ? { label: "Succeeded", class: "succeeded" }
    : { label: "Failed", class: "failed" };
}

function permissionUse(entry: (typeof history.value)[number]) {
  const permission = entry.result?.authorization.allowed
    ? entry.result.authorization.permission
    : undefined;
  if (!permission) return;
  return permission.created
    ? "Created a reusable permission"
    : "Authorized by a saved permission";
}

function scope(value: string[] | "any", noun: string) {
  if (value === "any") return `any ${noun}`;
  if (!value.length) return `no ${noun}s`;
  return value.length === 1 ? `${noun} “${value[0]}”` : `${value.length} ${noun}s`;
}

function recipientScope(value: string[] | "any") {
  if (value === "any") return "any visibility";
  if (!value.length) return "private visibility";
  return `visibility for ${value.length} recipient${value.length === 1 ? "" : "s"}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
</script>

<template>
  <main class="audit-page" :aria-busy="loading || busy">
    <header class="page-header">
      <div>
        <p class="eyebrow">Graffiti Data Guard</p>
        <h1>Permissions and activity</h1>
        <p>Review what applications may do and what they have requested.</p>
      </div>
      <a v-if="redirectUrl" class="button" :href="redirectUrl">Return to app</a>
    </header>

    <section class="filters" aria-labelledby="filter-heading">
      <header>
        <h2 id="filter-heading">Filters</h2>
        <button
          v-if="hasFilters"
          type="button"
          class="quiet"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </header>
      <div class="filter-fields">
        <label for="source-filter">Source</label>
        <select id="source-filter" v-model="source">
          <option value="">All sources</option>
          <option v-for="item in sources" :key="item.key" :value="item.key">
            {{ sourceLabel(item) }}
          </option>
        </select>
        <label for="actor-filter">Actor</label>
        <select id="actor-filter" v-model="actor">
          <option value="">All actors</option>
          <option v-for="item in actors" :key="item">{{ item }}</option>
        </select>
      </div>
    </section>

    <nav class="tabs" aria-label="Audit views">
      <button
        type="button"
        :aria-current="tab === 'permissions' ? 'page' : undefined"
        @click="tab = 'permissions'"
      >
        Permissions <span>{{ shownPermissions.length }}</span>
      </button>
      <button
        type="button"
        :aria-current="tab === 'history' ? 'page' : undefined"
        @click="tab = 'history'"
      >
        History <span>{{ shownHistory.length }}</span>
      </button>
    </nav>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="empty" aria-live="polite">Loading audit data…</p>

    <section v-else-if="tab === 'permissions'" aria-labelledby="permissions-heading">
      <header class="section-header">
        <div>
          <h2 id="permissions-heading">Active permissions</h2>
          <p>These requests can proceed without asking again.</p>
        </div>
        <button
          type="button"
          class="danger"
          :disabled="busy || !shownPermissions.length"
          @click="revokeShown"
        >
          Revoke shown
        </button>
      </header>

      <p v-if="!shownPermissions.length" class="empty">
        No permissions match these filters.
      </p>
      <ol v-else class="records">
        <li v-for="permission in shownPermissions" :key="permission.id">
          <article class="record">
            <header class="record-header">
              <div>
                <p class="method">{{ methodLabel(permission.method) }}</p>
                <h3>{{ permissionSummary(permission) }}</h3>
              </div>
              <TimestampValue
                :value="new Date(permission.createdAt)"
              />
            </header>
            <dl class="metadata">
              <div><dt>Source</dt><dd>{{ sourceLabel(permission.source) }}</dd></div>
              <div><dt>Actor</dt><dd><IdentityValue :actor="permission.actor" /></dd></div>
            </dl>
            <details>
              <summary>Exact permission data</summary>
              <pre>{{ JSON.stringify(permission.match, null, 2) }}</pre>
            </details>
            <footer class="record-actions">
              <button
                type="button"
                class="danger"
                :disabled="busy"
                @click="revoke(permission)"
              >
                Revoke
              </button>
            </footer>
          </article>
        </li>
      </ol>
    </section>

    <section v-else aria-labelledby="history-heading">
      <header class="section-header">
        <div>
          <h2 id="history-heading">Request history</h2>
          <p>Decisions and outcomes are recorded separately.</p>
        </div>
      </header>

      <p v-if="!shownHistory.length" class="empty">
        No requests match these filters.
      </p>
      <ol v-else class="records">
        <li v-for="entry in shownHistory" :key="entry.request.id">
          <article class="record">
            <header class="record-header">
              <div>
                <p class="method">{{ methodLabel(entry.request.method) }}</p>
                <h3>{{ requestSummary(entry.request) }}</h3>
              </div>
              <div class="outcome">
                <span class="status" :class="status(entry).class">
                  {{ status(entry).label }}
                </span>
                <TimestampValue
                  :value="new Date(entry.request.createdAt)"
                />
              </div>
            </header>
            <dl class="metadata">
              <div><dt>Source</dt><dd>{{ sourceLabel(entry.request.source) }}</dd></div>
              <div><dt>Actor</dt><dd><IdentityValue :actor="entry.request.actor" /></dd></div>
            </dl>
            <p v-if="permissionUse(entry)" class="permission-use">
              {{ permissionUse(entry) }}
            </p>
            <p v-if="entry.request.undoOf" class="permission-use">
              Recovery of request <UuidValue :value="entry.request.undoOf" />
            </p>
            <p
              v-if="entry.result?.execution && !entry.result.execution.ok"
              class="error"
            >
              {{ entry.result.execution.error }}
            </p>
            <details>
              <summary>Exact request data</summary>
              <pre>{{ JSON.stringify(entry.request.subject, null, 2) }}</pre>
            </details>
            <details
              v-if="entry.result?.execution?.ok && entry.result.execution.value !== undefined"
            >
              <summary>Result identifiers</summary>
              <pre>{{ JSON.stringify(entry.result.execution.value, null, 2) }}</pre>
            </details>
            <footer
              v-if="canRecover(entry.request) && entry.result?.execution?.ok"
              class="record-actions"
            >
              <button
                type="button"
                :disabled="busy"
                @click="recover(entry.request)"
              >
                {{ entry.request.method === "delete" ? "Restore to new URL" : "Undo" }}
              </button>
            </footer>
          </article>
        </li>
      </ol>
    </section>

    <section class="maintenance" aria-labelledby="maintenance-heading">
      <div>
        <h2 id="maintenance-heading">Audit data</h2>
        <p>Clear history alone, or revoke every permission and clear everything.</p>
      </div>
      <div class="maintenance-actions">
        <button type="button" :disabled="busy" @click="clearHistory">
          Clear history
        </button>
        <button type="button" class="danger" :disabled="busy" @click="clearEverything">
          Clear everything
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.audit-page { width: 100%; min-height: 100dvh; padding: 2rem max(1rem, calc((100% - 68rem) / 2)) 4rem; color: var(--text-color); background: var(--background-color); }
.page-header, .section-header, .record-header, .filters header, .maintenance { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.page-header { margin-bottom: 1.5rem; }
.page-header h1 { margin: 0.1rem 0 0.35rem; color: var(--title-color); font-size: clamp(2rem, 5vw, 3rem); line-height: 1; }
.eyebrow, .method { color: var(--secondary-color); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
h2, h3, p { margin: 0; }
h2 { color: var(--title-color); font-size: 1.2rem; }
h3 { margin-top: 0.2rem; color: var(--title-color); font-size: 1.05rem; overflow-wrap: anywhere; }
.button, button, select { border: 1px solid var(--border-color); border-radius: 0.45rem; padding: 0.45rem 0.7rem; color: var(--text-color); background: var(--background-color-interactive); font: inherit; }
.button, button { cursor: pointer; text-decoration: none; }
.button:hover, button:hover { border-color: var(--border-color-hover); color: var(--text-color); background: var(--background-color-interactive-hover); text-decoration: none; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.danger { color: var(--warning-color); }
button.quiet { border: 0; padding: 0; color: var(--link-color); background: transparent; }
button.quiet:hover { color: var(--link-hover-color); text-decoration: underline; }
.filters { margin-bottom: 1.25rem; border: 1px solid var(--border-color); border-radius: 0.6rem; padding: 0.9rem; background: color-mix(in srgb, var(--background-color-interactive) 45%, var(--background-color)); }
.filters header { align-items: center; margin-bottom: 0.75rem; }
.filter-fields { display: grid; grid-template-columns: max-content minmax(10rem, 1fr) max-content minmax(10rem, 1fr); align-items: center; gap: 0.55rem 0.75rem; }
.filter-fields label { font-weight: 600; }
.filter-fields select { width: 100%; min-width: 0; }
.tabs { display: flex; gap: 0.35rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); }
.tabs button { border: 0; border-radius: 0.45rem 0.45rem 0 0; background: transparent; }
.tabs button[aria-current="page"] { color: var(--accent-button-text); background: var(--accent-button-background); }
.tabs span { display: inline-block; min-width: 1.5em; margin-left: 0.3rem; border-radius: 999px; padding: 0 0.35rem; background: color-mix(in srgb, currentColor 15%, transparent); font-size: 0.82em; text-align: center; }
.section-header { align-items: center; margin-bottom: 0.9rem; }
.section-header p, .page-header p, .maintenance p { margin-top: 0.25rem; color: var(--secondary-color); }
.records { display: grid; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
.record { display: grid; gap: 0.8rem; border: 1px solid var(--border-color); border-radius: 0.6rem; padding: 1rem; background: var(--background-color); }
.outcome { display: grid; justify-items: end; gap: 0.35rem; }
.status { border-radius: 999px; padding: 0.12rem 0.5rem; font-size: 0.78rem; font-weight: 700; }
.status.pending, .status.allowed { color: var(--secondary-color); background: var(--background-color-interactive); }
.status.succeeded { color: #246b38; background: color-mix(in srgb, #4caf68 20%, var(--background-color)); }
.status.denied, .status.failed { color: var(--warning-color); background: color-mix(in srgb, var(--warning-color) 14%, var(--background-color)); }
.metadata { display: grid; gap: 0.35rem; margin: 0; }
.metadata div { display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: 0.6rem; }
.metadata dt { color: var(--secondary-color); font-size: 0.85rem; font-weight: 600; }
.metadata dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.metadata code, .permission-use code { word-break: break-all; }
.permission-use { border-left: 3px solid var(--border-color); padding-left: 0.65rem; color: var(--secondary-color); font-size: 0.9rem; }
details { border-top: 1px solid var(--border-color); padding-top: 0.65rem; }
summary { color: var(--link-color); cursor: pointer; }
pre { max-height: 18rem; overflow: auto; margin: 0.55rem 0 0; border-radius: 0.4rem; padding: 0.7rem; background: var(--background-color-interactive); font-size: 0.85rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.record-actions { display: flex; justify-content: flex-end; }
.empty { margin: 1rem 0; border: 1px dashed var(--border-color); border-radius: 0.6rem; padding: 2rem; color: var(--secondary-color); text-align: center; }
.error { color: var(--warning-color); }
.maintenance { align-items: center; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.25rem; }
.maintenance-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.6rem; }

@media (max-width: 44rem) {
  .audit-page { padding-top: 1rem; }
  .page-header, .section-header, .record-header, .maintenance { flex-direction: column; }
  .page-header .button, .section-header > button { width: 100%; text-align: center; }
  .filter-fields { grid-template-columns: 1fr; }
  .filter-fields label:not(:first-child) { margin-top: 0.35rem; }
  .outcome { justify-items: start; }
  .maintenance-actions { width: 100%; }
  .maintenance-actions button { flex: 1; }
}
</style>
