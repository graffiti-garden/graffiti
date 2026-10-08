<template>
    <p><RouterLink :to="{ name: 'home', hash: '#actor' }">← Back to actor</RouterLink></p>
    <header>
        <h2>{{ currentActor ? "Replace actor" : "Choose actor" }}</h2>
    </header>
    <p v-if="currentActor" role="alert">
        <strong>Warning:</strong> changing the actor will not change the actor
        of existing posts. Proceed with caution.
    </p>
    <p v-if="customHandle">
        Your custom-domain handle <code>{{ customHandle }}</code> is hosted elsewhere.
        After replacing the actor, update its <code>did.json</code> so the new
        actor DID is first in <code>alsoKnownAs</code>. Until then, the handle
        will still point to the old actor.
    </p>
    <template v-if="loadError">
        <p role="alert">{{ loadError }}</p>
        <button @click="load">Retry</button>
    </template>
    <p v-else-if="currentActor === undefined || accountData === undefined">
        <em>Loading...</em>
    </p>
    <ol v-else class="steps">
        <li>
            <h3>{{ currentActor ? "How would you like to replace the actor?" : "How would you like to set up your actor?" }}</h3>
            <div class="choices">
                <button type="button" :aria-pressed="choice === 'create'" @click="choose('create')">
                    <strong>Create New Actor</strong>
                </button>
                <button type="button" :aria-pressed="choice === 'import'" @click="choose('import')">
                    <strong>Import Actor Private Key</strong>
                </button>
                <button type="button" :aria-pressed="choice === 'external'" @click="choose('external')">
                    <strong>Use Actor Managed Elsewhere</strong>
                </button>
            </div>
        </li>

        <li v-if="choice && currentActor?.rotationKey && !exported" v-scroll-into-view>
            <h3>Export your current private key</h3>
            <p>Save this key before replacing the actor. You may need it to manage the old DID later.</p>
            <button :disabled="exporting" @click="exportCurrentKey">
                {{ exporting ? "Exporting..." : "Export private key" }}
            </button>
            <p v-if="error" role="alert">{{ error }}</p>
        </li>

        <li v-if="choice === 'create' && (!currentActor?.rotationKey || exported)" v-scroll-into-view>
            <h3>Create a new actor</h3>
            <p v-if="currentActor">The new actor will keep your current actor's services. You can edit its DID afterward.</p>
            <p v-else>The new actor will use your current handle, bucket, and inbox.</p>
            <button :disabled="saving" @click="createActor">
                {{ saving ? "Creating..." : currentActor ? "Create and replace actor" : "Create actor" }}
            </button>
            <p v-if="error" role="alert">{{ error }}</p>
        </li>

        <li v-if="choice === 'import' && (!currentActor?.rotationKey || exported)" v-scroll-into-view>
            <h3>Import an actor's private key</h3>
            <form @submit.prevent="importActor">
                <label>
                    Actor file
                    <input type="file" accept="application/json,.json" required @change="selectFile" />
                </label>
                <button :disabled="saving || !file" type="submit">
                    {{ saving ? "Importing..." : currentActor ? "Import and replace actor" : "Import actor" }}
                </button>
            </form>
            <p v-if="error" role="alert">{{ error }}</p>
        </li>

        <li v-if="choice === 'external' && (!currentActor?.rotationKey || exported)" v-scroll-into-view>
            <h3>Choose actor</h3>
            <form @submit.prevent="externalReady = true">
                <label>
                    Actor DID
                    <input v-model.trim="externalDid" placeholder="did:plc:..." pattern="did:plc:[a-z2-7]{24}" required />
                </label>
                <button type="submit">Continue</button>
            </form>
        </li>

        <li v-if="choice === 'external' && externalReady">
            <h3 v-scroll-into-view>Update actor and services</h3>
            <p>At the provider managing <code>{{ externalDid }}</code>, make your handle the first <code>did:web:</code> entry in <code>alsoKnownAs</code>. This is required to verify the actor:</p>
            <pre><code>{{ accountData.alsoKnownAs[0] }}</code></pre>
            <CopyButton :text="accountData.alsoKnownAs[0]" />
            <p>Optional: if you want to use services hosted here, add the applicable entries below under <code>services</code>. Keep any external service entries you use.</p>
            <p>Graffiti clients still need a storage bucket, personal inbox, and shared inbox in the actor's DID. These can be hosted anywhere.</p>
            <pre><code>{{ JSON.stringify(accountData.services, null, 2) }}</code></pre>
            <CopyButton :text="JSON.stringify(accountData.services, null, 2)" />
        </li>

        <li v-if="choice === 'external' && externalReady">
            <h3>Verify</h3>
            <p>Once you've published the handle alias, verify the actor's handle link.</p>
            <button :disabled="saving" @click="attachActor">
                {{ saving ? "Verifying..." : "Verify and use actor" }}
            </button>
            <p v-if="error" role="alert">{{ error }}</p>
        </li>
    </ol>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { identifierToDid, type OptionalServices } from "../../../shared/did-schemas";
import { serviceIdToUrl } from "../../../shared/service-urls";
import { fetchFromSelf } from "../globals";
import CopyButton from "../utils/CopyButton.vue";
import { fetchActorDidData } from "./plc-directory";
import type { Actor } from "./types";
import { exportPrivateKey } from "./export-private-key";

const router = useRouter();
const currentActor = ref<Actor | null | undefined>(undefined);
const accountData = ref<{ alsoKnownAs: string[]; services: NonNullable<OptionalServices> }>();
const customHandle = ref<string | null>(null);
const loadError = ref("");
const choice = ref<"create" | "import" | "external" | null>(null);
const exported = ref(false);
const exporting = ref(false);
const saving = ref(false);
const error = ref("");
const file = ref<File | null>(null);
const externalDid = ref("");
const externalReady = ref(false);
watch(externalDid, () => externalReady.value = false);

async function load() {
    currentActor.value = undefined;
    accountData.value = undefined;
    customHandle.value = null;
    loadError.value = "";
    try {
        const [actorResult, handles, buckets, inboxes] = await Promise.all([
            fetchFromSelf("/app/actors/list"),
            fetchFromSelf("/app/handles/list"),
            fetchFromSelf("/app/service-instances/bucket/list"),
            fetchFromSelf("/app/service-instances/inbox/list"),
        ]) as [
            { actors: Actor[] },
            { handles: Array<{ identifier: string }> },
            Array<{ serviceId: string }>,
            Array<{ serviceId: string }>,
        ];
        const identifier = handles.handles[0]?.identifier;
        if (!identifier) throw new Error("This account has no handle.");
        customHandle.value = identifier.startsWith("did:web:")
            ? identifier.slice("did:web:".length)
            : null;
        const baseHost = window.location.host;
        const services: NonNullable<OptionalServices> = {};
        if (buckets[0]) services.graffitiStorageBucket = {
            type: "GraffitiStorageBucket",
            endpoint: serviceIdToUrl(buckets[0].serviceId, "bucket", baseHost),
        };
        if (inboxes[0]) services.graffitiPersonalInbox = {
            type: "GraffitiInbox",
            endpoint: serviceIdToUrl(inboxes[0].serviceId, "inbox", baseHost),
        };
        services.graffitiSharedInbox_0 = {
            type: "GraffitiInbox",
            endpoint: serviceIdToUrl("shared", "inbox", baseHost),
        };
        currentActor.value = actorResult.actors[0] ?? null;
        // An export made on the actor page counts here too. A direct visit
        // still needs an export before it can replace a locally managed actor.
        exported.value = !!currentActor.value &&
            currentActor.value.did === window.history.state?.exportedActorDid;
        accountData.value = {
            alsoKnownAs: [identifierToDid(identifier, baseHost)],
            services,
        };
    } catch (cause) {
        loadError.value = String(cause);
    }
}
load();

function choose(next: "create" | "import" | "external") {
    if (next !== choice.value) file.value = null;
    choice.value = next;
    error.value = "";
}

async function exportCurrentKey() {
    if (!currentActor.value) return;
    exporting.value = true;
    try {
        if (await exportPrivateKey(currentActor.value.did)) exported.value = true;
    } catch (cause) {
        error.value = String(cause);
    } finally {
        exporting.value = false;
    }
}

async function createActor() {
    if (!accountData.value) return;
    saving.value = true;
    error.value = "";
    try {
        const services = currentActor.value
            ? (await fetchActorDidData(currentActor.value)).services
            : accountData.value.services;
        await fetchFromSelf("/app/actors/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...accountData.value,
                services,
                replace: !!currentActor.value,
            }),
        });
        await router.push({ name: "home", hash: "#actor" });
    } catch (cause) {
        error.value = String(cause);
    } finally {
        saving.value = false;
    }
}

function selectFile(event: Event) {
    file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function importActor() {
    if (!file.value || !accountData.value) return;
    saving.value = true;
    error.value = "";
    try {
        const actor = JSON.parse(await file.value.text());
        if (currentActor.value && actor.did === currentActor.value.did && currentActor.value.rotationKey) {
            throw new Error("This account already manages that actor's key.");
        }
        await fetchFromSelf("/app/actors/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...actor,
                alsoKnownAs: accountData.value.alsoKnownAs,
                replace: !!currentActor.value,
            }),
        });
        await router.push({ name: "home", hash: "#actor" });
    } catch (cause) {
        error.value = String(cause);
    } finally {
        saving.value = false;
    }
}

async function attachActor() {
    saving.value = true;
    error.value = "";
    try {
        await fetchFromSelf("/app/actors/attach", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ did: externalDid.value, replace: !!currentActor.value }),
        });
        await router.push({ name: "home", hash: "#actor" });
    } catch (cause) {
        error.value = String(cause);
    } finally {
        saving.value = false;
    }
}
</script>

<style scoped>
h3 {
    scroll-margin-top: 6rem;
}

pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
</style>
