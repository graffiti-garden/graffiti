<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Permission, Request } from "../core/db.js";
import type { Guard } from "../core/guard.js";
import { sourceLabel } from "../core/source.js";

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
const busy = ref(false);
const error = ref("");

const sources = computed(() => {
  const values = [
    ...(props.initialSource ? [props.initialSource] : []),
    ...permissions.value.map(({ source }) => source),
    ...history.value.map(({ request }) => request.source),
  ];
  return [...new Map(values.map((item) => [item.key, item])).values()];
});
const actors = computed(() =>
  [...new Set([
    ...(props.initialActor ? [props.initialActor] : []),
    ...permissions.value.map(({ actor }) => actor),
    ...history.value.map(({ request }) => request.actor),
  ])].sort(),
);
const shownPermissions = computed(() =>
  permissions.value.filter(matchesFilter),
);
const shownHistory = computed(() =>
  history.value.filter(({ request }) => matchesFilter(request)),
);

onMounted(load);

async function load() {
  const audit = await props.guard.audit();
  permissions.value = audit.permissions;
  history.value = audit.requests;
}

function matchesFilter(value: { source: Permission["source"]; actor: string }) {
  return (
    (!source.value || value.source.key === source.value) &&
    (!actor.value || value.actor === actor.value)
  );
}

async function run(operation: () => Promise<unknown>) {
  busy.value = true;
  error.value = "";
  try {
    await operation();
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function revoke(permission: Permission) {
  await run(() => props.guard.revoke(permission.id));
}

async function revokeShown() {
  if (!confirm(`Revoke ${shownPermissions.value.length} matching permissions?`)) return;
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
  if (confirm("Clear request history?")) await run(() => props.guard.clearHistory());
}

async function clearEverything() {
  if (confirm("Clear every permission and request?")) {
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

function time(value: number) {
  return new Date(value).toLocaleString();
}
</script>

<template>
  <aside class="backdrop">
    <section class="panel" role="dialog" aria-modal="true" aria-labelledby="audit-title">
      <header class="top">
        <div>
          <h1 id="audit-title">Graffiti Guard Audit</h1>
          <p>Review permissions and guarded requests.</p>
        </div>
        <a v-if="redirectUrl" class="button" :href="redirectUrl">Return to app</a>
      </header>

      <section class="filters">
        <label>Source<select v-model="source"><option value="">All sources</option><option v-for="item in sources" :key="item.key" :value="item.key">{{ sourceLabel(item) }}</option></select></label>
        <label>Actor<select v-model="actor"><option value="">All actors</option><option v-for="item in actors" :key="item">{{ item }}</option></select></label>
      </section>

      <nav class="tabs">
        <button type="button" :aria-current="tab === 'permissions'" @click="tab = 'permissions'">Permissions ({{ shownPermissions.length }})</button>
        <button type="button" :aria-current="tab === 'history'" @click="tab = 'history'">History ({{ shownHistory.length }})</button>
      </nav>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <main>
        <section v-if="tab === 'permissions'">
          <div class="actions"><button type="button" :disabled="busy || !shownPermissions.length" @click="revokeShown">Revoke Filtered</button></div>
          <p v-if="!shownPermissions.length" class="empty">No matching permissions.</p>
          <article v-for="permission in shownPermissions" :key="permission.id" class="record">
            <header><strong>{{ permission.method }}</strong><small>{{ time(permission.createdAt) }}</small></header>
            <p>{{ sourceLabel(permission.source) }}</p><small>{{ permission.actor }}</small>
            <details><summary>Exact permission</summary><pre>{{ JSON.stringify(permission.match, null, 2) }}</pre></details>
            <button type="button" :disabled="busy" @click="revoke(permission)">Revoke</button>
          </article>
        </section>

        <section v-else>
          <p v-if="!shownHistory.length" class="empty">No matching history.</p>
          <article v-for="entry in shownHistory" :key="entry.request.id" class="record">
            <header><strong>{{ entry.request.method }}</strong><small>{{ time(entry.request.createdAt) }}</small></header>
            <p>{{ sourceLabel(entry.request.source) }}</p><small>{{ entry.request.actor }}</small>
            <p v-if="!entry.result">Awaiting a decision.</p>
            <template v-else>
              <p>{{ entry.result.authorization.allowed ? 'Allowed' : 'Denied' }}</p>
              <p v-if="entry.result.execution">{{ entry.result.execution.ok ? 'Succeeded' : `Failed: ${entry.result.execution.error}` }}</p>
            </template>
            <details><summary>Exact request</summary><pre>{{ JSON.stringify(entry.request.subject, null, 2) }}</pre></details>
            <details v-if="entry.result?.execution?.ok && entry.result.execution.value !== undefined"><summary>Result identifiers</summary><pre>{{ JSON.stringify(entry.result.execution.value, null, 2) }}</pre></details>
            <button v-if="canRecover(entry.request) && entry.result?.execution?.ok" type="button" :disabled="busy" @click="recover(entry.request)">{{ entry.request.method === 'delete' ? 'Restore to New URL' : 'Undo' }}</button>
          </article>
        </section>
      </main>

      <footer>
        <button type="button" :disabled="busy" @click="clearHistory">Clear History</button>
        <button type="button" class="danger" :disabled="busy" @click="clearEverything">Clear Everything</button>
      </footer>
    </section>
  </aside>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; overflow: auto; padding: 1rem; background: rgb(0 0 0 / 35%); }
.panel { width: min(70rem, 100%); min-height: calc(100dvh - 2rem); margin: auto; border: 1px solid var(--border-color); border-radius: 0.6rem; padding: 1.25rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0 2.5rem rgb(0 0 0 / 70%); }
.top, .filters, .tabs, .actions, .record header, footer { display: flex; align-items: center; gap: 0.75rem; }
.top, .record header { justify-content: space-between; }
.top p, small { color: var(--secondary-color); }
.filters { flex-wrap: wrap; margin: 1.25rem 0; }.filters label { display: grid; flex: 1 1 18rem; gap: 0.3rem; }
button, select, .button { border: 1px solid var(--border-color); border-radius: 0.4rem; padding: 0.4rem 0.65rem; color: var(--text-color); background: var(--background-color-interactive); }
button:hover, .button:hover { background: var(--background-color-interactive-hover); text-decoration: none; } button:disabled { opacity: 0.55; }
.tabs { border-bottom: 1px solid var(--border-color); }.tabs button[aria-current="true"] { color: var(--accent-button-text); background: var(--accent-button-background); }
main { padding: 1rem 0; }.actions, footer { justify-content: flex-end; }.record { display: grid; gap: 0.45rem; margin-bottom: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.85rem; }
pre { max-height: 18rem; overflow: auto; margin-top: 0.4rem; border-radius: 0.35rem; padding: 0.65rem; background: var(--background-color-interactive); white-space: pre-wrap; overflow-wrap: anywhere; }
.empty { padding: 2rem; text-align: center; }.error, .danger { color: var(--warning-color); } footer { border-top: 1px solid var(--border-color); padding-top: 1rem; }
</style>
