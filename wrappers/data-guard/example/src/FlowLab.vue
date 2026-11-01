<script setup lang="ts">
import type { Graffiti, GraffitiObjectBase, GraffitiObjectStream } from "@graffiti-garden/api";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";
import { computed, onUnmounted, ref, shallowRef } from "vue";
import NestedFrame from "./NestedFrame.vue";

const props = withDefaults(defineProps<{ nested?: boolean; auditUrl?: string; createGraffiti?: () => Graffiti }>(), {
  nested: false,
});

const graffiti = useGraffiti();
const session = useGraffitiSession();
const parameters = new URLSearchParams(window.location.search);
const labId = parameters.get("lab") || crypto.randomUUID();
if (!parameters.get("lab")) {
  parameters.set("lab", labId);
  window.history.replaceState(null, "", `${window.location.pathname}?${parameters}${window.location.hash}`);
}
const channel = `https://graffiti.garden/examples/data-guard/flow-lab/${encodeURIComponent(labId)}`;
const siteOrigin = window.location.origin;
const parentOrigin = props.nested ? parameters.get("parentOrigin") : null;
const otherPort = window.location.port === "5183" ? "5185" : "5183";
const otherSite = `${window.location.protocol}//${window.location.hostname}:${otherPort}/flow-lab.html?lab=${encodeURIComponent(labId)}`;
const outerSiteName = window.location.port === "5183" ? "Site A" : window.location.port === "5185" ? "Site B" : "This site";
const parentSiteName = parentOrigin?.includes(":5183") ? "Site A" : parentOrigin?.includes(":5185") ? "Site B" : "parent site";
const siteName = props.nested ? `Child of ${parentSiteName}` : outerSiteName;
const schema = {
  type: "object",
  properties: {
    value: {
      type: "object",
      properties: { "guard flow lab": { const: true } },
      required: ["guard flow lab"],
    },
  },
  required: ["value"],
};

const text = ref("");
const visibility = ref<"public" | "private" | "recipients">("private");
const recipients = ref("");
const confirm = ref(false);
const objectUrl = ref("");
const mediaUrl = ref("");
const mediaFile = shallowRef<File>();
const mediaPrivate = ref(true);
const useSessionForReads = ref(true);
const objects = shallowRef<GraffitiObjectBase[]>([]);
const cursor = ref<string>();
const busy = ref("");
const error = ref("");
const notices = ref<string[]>([]);
const mediaDownloadUrl = ref("");
const mediaDescription = ref("");
const showChild = ref(false);
const signedIn = computed(() => session.value ?? undefined);
const readSession = computed(() => useSessionForReads.value ? signedIn.value : undefined);

function note(message: string) {
  notices.value = [`${new Date().toLocaleTimeString()} — ${message}`, ...notices.value].slice(0, 12);
}

function describe(errorValue: unknown) {
  return errorValue instanceof Error ? errorValue.message : String(errorValue);
}

async function run(label: string, action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = label;
  error.value = "";
  try {
    await action();
  } catch (cause) {
    error.value = `${label}: ${describe(cause)}`;
    note(error.value);
  } finally {
    busy.value = "";
  }
}

function needSession() {
  if (!signedIn.value) throw new Error("Log in on this site first.");
  return signedIn.value;
}

function allowed() {
  if (visibility.value === "public") return undefined;
  if (visibility.value === "private") return [];
  return recipients.value.split(",").map((actor) => actor.trim()).filter(Boolean);
}

function selectFile(event: Event) {
  mediaFile.value = (event.target as HTMLInputElement).files?.[0];
}

function siteOf(object: GraffitiObjectBase) {
  const value = object.value as Record<string, unknown>;
  const site = value["via site"];
  return site && typeof site === "object" && "name" in site
    ? String(site.name)
    : "Unknown origin";
}

function isConfirmed(object: GraffitiObjectBase) {
  return (object.value as Record<string, unknown>)["confirm with guard"] === true;
}

function isPrivate(object: GraffitiObjectBase) {
  return object.allowed != null;
}

async function post() {
  await run("Post object", async () => {
    const visibilityList = allowed();
    const posted = await graffiti.post({
      value: {
        "guard flow lab": true,
        text: text.value || "Test object",
        created: new Date().toISOString(),
        ...(confirm.value ? { "confirm with guard": true } : {}),
      },
      channels: [channel],
      ...(visibilityList === undefined ? {} : { allowed: visibilityList }),
    }, needSession());
    objectUrl.value = posted.url;
    objects.value = [posted, ...objects.value.filter((item) => item.url !== posted.url)];
    note(`Posted ${confirm.value ? "confirmed " : ""}${visibility.value} object on ${siteName}.`);
  });
}

async function getObject() {
  await run("Get object", async () => {
    if (!objectUrl.value) throw new Error("Enter an object URL.");
    const object = await graffiti.get(objectUrl.value, {}, readSession.value);
    objects.value = [object, ...objects.value.filter((item) => item.url !== object.url)];
    note(`Read object made via ${siteOf(object)}.`);
  });
}

async function deleteObject() {
  await run("Delete object", async () => {
    if (!objectUrl.value) throw new Error("Enter an object URL.");
    await graffiti.delete(objectUrl.value, needSession());
    objects.value = objects.value.filter((item) => item.url !== objectUrl.value);
    note("Deleted object.");
  });
}

async function consume(stream: GraffitiObjectStream<{}>, replace: boolean) {
  const found = replace ? new Map<string, GraffitiObjectBase>() :
    new Map(objects.value.map((object) => [object.url, object]));
  let changes = 0;
  while (true) {
    const next = await stream.next();
    if (next.done) {
      cursor.value = next.value.cursor;
      objects.value = [...found.values()];
      note(`${replace ? "Discovery" : "Poll"} finished with ${changes} result${changes === 1 ? "" : "s"}.`);
      return;
    }
    if (next.value.error) {
      note(`Discovery error from ${next.value.origin}: ${next.value.error.message}`);
      continue;
    }
    changes++;
    if (next.value.tombstone) {
      found.delete(next.value.object.url);
      note(`Deletion notice for ${next.value.object.url}.`);
    } else {
      found.set(next.value.object.url, next.value.object);
    }
  }
}

async function discover() {
  await run("Discover", async () => {
    cursor.value = undefined;
    await consume(graffiti.discover<{}>([channel], schema, readSession.value), true);
  });
}

async function poll() {
  await run("Poll changes", async () => {
    if (!cursor.value) throw new Error("Run Discover first.");
    await consume(graffiti.continueDiscover<{}>(cursor.value, readSession.value), false);
  });
}

async function postMedia() {
  await run("Upload media", async () => {
    if (!mediaFile.value) throw new Error("Choose a file first.");
    mediaUrl.value = await graffiti.postMedia({
      data: mediaFile.value,
      ...(mediaPrivate.value ? { allowed: [] } : {}),
    }, needSession());
    note(`Uploaded ${mediaPrivate.value ? "private" : "public"} media on ${siteName}.`);
  });
}

async function getMedia() {
  await run("Get media", async () => {
    if (!mediaUrl.value) throw new Error("Enter a media URL.");
    const media = await graffiti.getMedia(mediaUrl.value, { maxBytes: 20_000_000 }, readSession.value);
    if (mediaDownloadUrl.value) URL.revokeObjectURL(mediaDownloadUrl.value);
    mediaDownloadUrl.value = URL.createObjectURL(media.data);
    mediaDescription.value = `${media.data.type || "Unknown type"}, ${media.data.size} bytes`;
    note(`Read media posted by ${media.actor}.`);
  });
}

async function deleteMedia() {
  await run("Delete media", async () => {
    if (!mediaUrl.value) throw new Error("Enter a media URL.");
    await graffiti.deleteMedia(mediaUrl.value, needSession());
    if (mediaDownloadUrl.value) URL.revokeObjectURL(mediaDownloadUrl.value);
    mediaDownloadUrl.value = "";
    mediaDescription.value = "";
    note("Deleted media.");
  });
}

onUnmounted(() => {
  if (mediaDownloadUrl.value) URL.revokeObjectURL(mediaDownloadUrl.value);
});
</script>

<template>
  <main class="container">
    <header>
      <h1>Data guard flow lab</h1>
      <p><strong>{{ siteName }}</strong> · {{ parentOrigin || siteOrigin }}</p>
      <small v-if="nested">Child frame served from {{ siteOrigin }}; the parent assigns its guard site ID.</small>
      <p>This lab uses your real account and storage. Use a test account and delete test data when finished.</p>
      <nav v-if="!nested" class="site-links">
        <a :href="otherSite" target="_blank" rel="noopener">Open {{ outerSiteName === "Site A" ? "Site B" : "Site A" }}</a>
        <a href="https://localhost:5184/" target="_blank" rel="noopener">Open guard host to accept its certificate</a>
        <a v-if="auditUrl" :href="auditUrl" target="_blank" rel="noopener">Audit permissions</a>
      </nav>
      <small>Lab channel: <code>{{ channel }}</code></small>
    </header>

    <article>
      <h2>1. Identity</h2>
      <p v-if="session === undefined">Checking signed-in accounts…</p>
      <p v-else-if="session === null">This site cannot use your account yet.</p>
      <p v-else>Using <code>{{ session.actor }}</code> on this site.</p>
      <div class="actions">
        <button type="button" :disabled="Boolean(busy)" @click="run('Log in', () => graffiti.login())">{{ signedIn ? "Choose another account" : "Log in" }}</button>
        <button type="button" class="secondary outline" :disabled="Boolean(busy) || !signedIn" @click="run('Log out', () => graffiti.logout(needSession()))">Log out</button>
      </div>
      <small>Log in on Site A, then open Site B and log in there to see the existing-account approval.</small>
    </article>

    <article v-if="!nested">
      <h2>Nested site</h2>
      <p>The parent assigns this frame a child ID. Logging in inside the child also makes the account available to this parent. The parent can read and delete data made by the child.</p>
      <button type="button" class="secondary" @click="showChild = !showChild">{{ showChild ? "Close child" : "Open child" }}</button>
      <NestedFrame v-if="showChild && createGraffiti" :lab-id="labId" :create-graffiti="createGraffiti" />
    </article>

    <article>
      <h2>2. Post an object</h2>
      <label>Text <textarea v-model="text" rows="2" placeholder="A test note" /></label>
      <div class="row">
        <label>Visibility
          <select v-model="visibility">
            <option value="public">Public</option>
            <option value="private">Only me</option>
            <option value="recipients">Me and listed actors</option>
          </select>
        </label>
        <label v-if="visibility === 'recipients'">Allowed actor IDs, comma-separated
          <input v-model="recipients" placeholder="did:…" />
        </label>
      </div>
      <label><input v-model="confirm" type="checkbox" /> Ask for direct confirmation of this post</label>
      <button type="button" :disabled="Boolean(busy) || !signedIn" @click="post">Post object</button>
      <small>Ordinary posts have no extra prompt. A confirmed post shows its full data in a guard dialog.</small>
    </article>

    <article>
      <h2>3. Read or delete an object</h2>
      <label>Object URL <input v-model="objectUrl" placeholder="Post here or paste a URL from the other site" /></label>
      <label><input v-model="useSessionForReads" type="checkbox" /> Use my account for reads</label>
      <div class="actions">
        <button type="button" :disabled="Boolean(busy)" @click="getObject">Get exact object</button>
        <button type="button" class="secondary" :disabled="Boolean(busy) || !signedIn" @click="deleteObject">Delete exact object</button>
      </div>
      <small>Try a private object from the other site. Getting it asks for read access; deleting it asks separately.</small>
    </article>

    <article>
      <h2>4. Discover and poll</h2>
      <div class="actions">
        <button type="button" :disabled="Boolean(busy)" @click="discover">Discover lab channel</button>
        <button type="button" class="secondary" :disabled="Boolean(busy) || !cursor" @click="poll">Poll changes</button>
      </div>
      <small>Discover on one site, delete a found object on the other, then poll to inspect its deletion notice.</small>
      <p v-if="objects.length === 0">No objects loaded yet.</p>
      <ul v-else class="objects">
        <li v-for="object in objects" :key="object.url">
          <strong>{{ String((object.value as Record<string, unknown>).text ?? 'Object') }}</strong>
          <small>{{ isPrivate(object) ? 'Private' : 'Public' }} · {{ isConfirmed(object) ? 'Confirmed' : 'Ordinary' }} · via {{ siteOf(object) }}</small>
          <code>{{ object.url }}</code>
          <div class="actions"><button type="button" class="secondary outline" @click="objectUrl = object.url">Use this URL above</button></div>
          <details><summary>Full object</summary><pre>{{ JSON.stringify(object, null, 2) }}</pre></details>
        </li>
      </ul>
    </article>

    <article>
      <h2>5. Media</h2>
      <label>File <input type="file" @change="selectFile" /></label>
      <label><input v-model="mediaPrivate" type="checkbox" /> Upload privately</label>
      <button type="button" :disabled="Boolean(busy) || !signedIn || !mediaFile" @click="postMedia">Upload media</button>
      <label>Media URL <input v-model="mediaUrl" placeholder="Upload here or paste a URL from the other site" /></label>
      <div class="actions">
        <button type="button" :disabled="Boolean(busy)" @click="getMedia">Get media</button>
        <button type="button" class="secondary" :disabled="Boolean(busy) || !signedIn" @click="deleteMedia">Delete media</button>
      </div>
      <p v-if="mediaDownloadUrl"><a :href="mediaDownloadUrl" download="guard-lab-media">Download fetched media</a> · {{ mediaDescription }}</p>
      <small>Private media from the other site uses the same read grant as private objects.</small>
    </article>

    <article aria-live="polite">
      <h2>Activity</h2>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="busy" aria-busy="true">{{ busy }}…</p>
      <ol><li v-for="notice in notices" :key="notice">{{ notice }}</li></ol>
    </article>
  </main>
</template>

<style scoped>
main { max-width: 60rem; padding-block: 2rem 5rem; }
article { margin-block: 1.5rem; }
article h2 { font-size: 1.25rem; }
.actions, .site-links { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-block: 0.75rem; }
.actions button, .site-links a { width: auto; margin: 0; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
.objects { padding-left: 1.25rem; }
.objects li { margin-block: 1rem; overflow-wrap: anywhere; }
.objects small, .objects code { display: block; margin-block: 0.3rem; }
pre { overflow: auto; max-height: 22rem; }
.error { color: var(--pico-del-color); }
</style>
