<template>
    <p><RouterLink :to="{ name: 'home', hash: '#handle' }">← Back to handle</RouterLink></p>
    <header>
        <h2>Replace handle</h2>
    </header>

    <ol class="steps">
        <li>
            <h3>Choose where to host your handle</h3>
            <p>
                Would you like a handle ending in <code>.{{ baseHost }}</code>
                or would you like to use a custom domain like <code>alice.com</code>?
            </p>
            <div class="choices">
                <button type="button" :aria-pressed="choice === 'local'" @click="chooseLocal">
                    <strong>.{{ baseHost }} handle</strong>
                    <span>Free and hosted by us.</span>
                </button>
                <button type="button" :aria-pressed="choice === 'custom'" @click="chooseCustom">
                    <strong>Custom domain</strong>
                    <span>You must purchase your own domain and host a small JSON file.</span>
                </button>
            </div>
        </li>

        <li v-if="choice === 'local'" v-scroll-into-view>
            <p v-if="actor === undefined"><em>Loading actor...</em></p>
            <p v-else-if="actorError" role="alert">{{ actorError }}</p>
            <p v-else-if="actor === null">
                Create or attach an <RouterLink :to="{ name: 'home', hash: '#actor' }">actor</RouterLink>
                before replacing your handle.
            </p>
            <RegisterHandle
                v-else
                replace
                :continueOnly="!actor.rotationKey"
                :onInput="() => pendingLocalName = null"
                :onRegister="replaceLocalHandle"
            />
        </li>

        <li v-else-if="choice === 'custom'" v-scroll-into-view>
            <h3>Set up your custom domain</h3>
            <p v-if="actor === undefined"><em>Loading actor...</em></p>
            <p v-else-if="actorError" role="alert">{{ actorError }}</p>
            <p v-else-if="actor === null">
                Create or attach an <RouterLink :to="{ name: 'home', hash: '#actor' }">actor</RouterLink>
                before using a custom domain.
            </p>
            <form v-else @submit.prevent="verifyDomain">
                <label>
                    What domain would you like to use? It must be a domain that you own.
                    <input
                        v-model.trim="domain"
                        required
                        v-focus
                        autocapitalize="none"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="example.com"
                    />
                </label>
                <p v-if="domain && !domainDid" role="alert">
                    Enter a domain name, such as example.com.
                </p>
                <template v-if="domainDid">
                    <p>Publish this exact JSON at <a :href="documentUrl" target="_blank"><code>{{ documentUrl }}</code></a>:</p>
                    <pre><code>{{ documentText }}</code></pre>
                    <CopyButton :text="documentText" />
                    <p>If your <code>did.json</code> lists other actors, put <code>{{ actor.did }}</code> first in <code>alsoKnownAs</code>. Graffiti clients use the first actor.</p>
                    <p>Once the file is available, verify it before replacing your handle.</p>
                    <button :disabled="verifying" type="submit">
                        {{ verifying ? "Verifying..." : "Verify domain" }}
                    </button>
                </template>
            </form>
            <p v-if="error && !verifiedDid" role="alert">{{ error }}</p>
        </li>

        <li v-if="choice === 'custom' && verifiedDid && actor?.rotationKey" v-scroll-into-view>
            <h3>Replace handle</h3>
            <p>Domain verified.</p>
            <button :disabled="replacing" @click="replaceCustomHandle">
                {{ replacing ? "Replacing handle..." : "Replace handle" }}
            </button>
            <p v-if="error" role="alert">{{ error }}</p>
        </li>
        <li v-if="actor && !actor.rotationKey && nextHandleDid" v-scroll-into-view>
            <h3>Update your actor</h3>
            <p>
                Graffiti does not hold this actor's private key. At the provider
                managing <code>{{ actor.did }}</code>, replace your old Graffiti
                alias in <code>alsoKnownAs</code> with
                <code>{{ nextHandleDid }}</code>. Make it the first <code>did:web:</code>
                alias and keep any other aliases.
            </p>
            <CopyButton :text="nextHandleDid" />
            <p>Once that change is published, verify it to replace your handle.</p>
            <button :disabled="replacing" @click="replaceExternalActorHandle">
                {{ replacing ? "Verifying..." : "Verify actor and replace handle" }}
            </button>
            <p v-if="error" role="alert">{{ error }}</p>
        </li>
    </ol>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { constructDidDocument, didWebToUrl, localNameToDid } from "../../../shared/did-schemas";
import { fetchFromSelf, refreshAccounts } from "../globals";
import CopyButton from "../utils/CopyButton.vue";
import RegisterHandle from "./RegisterHandle.vue";

const router = useRouter();
const baseHost = window.location.host;
const choice = ref<"local" | "custom" | null>(null);
const domain = ref("");
const actor = ref<{ did: string; rotationKey: string | null } | null | undefined>(undefined);
const actorError = ref("");
const error = ref("");
const verifying = ref(false);
const replacing = ref(false);
const verifiedDid = ref<string | null>(null);
const pendingLocalName = ref<string | null>(null);

async function loadActor() {
    actor.value = undefined;
    actorError.value = "";
    try {
        const result: { actors: Array<{ did: string; rotationKey: string | null }> } = await fetchFromSelf("/app/actors/list");
        actor.value = result.actors[0] ?? null;
    } catch (cause) {
        actorError.value = String(cause);
        actor.value = null;
    }
}
loadActor();

function chooseLocal() {
    choice.value = "local";
    error.value = "";
    pendingLocalName.value = null;
}

function chooseCustom() {
    choice.value = "custom";
    error.value = "";
    verifiedDid.value = null;
}

// The input is only a domain. The DID and document URL are derived from it.
const domainDid = computed(() => {
    const name = domain.value.toLowerCase();
    if (!name || /[:/?#@]/.test(name)) return null;
    const did = `did:web:${name}`;
    try {
        didWebToUrl(did);
        return did;
    } catch {
        return null;
    }
});
const documentUrl = computed(() => domainDid.value ? didWebToUrl(domainDid.value) : "");
const documentText = computed(() => {
    if (!domainDid.value || !actor.value) return "";
    return JSON.stringify(constructDidDocument({
        did: domainDid.value,
        alsoKnownAs: [actor.value.did],
        services: undefined,
    }), null, 2);
});

const nextHandleDid = computed(() =>
    choice.value === "local" && pendingLocalName.value
        ? localNameToDid(pendingLocalName.value, baseHost)
        : choice.value === "custom" ? verifiedDid.value : null,
);

watch(domain, () => {
    verifiedDid.value = null;
    error.value = "";
});

async function verifyDomain() {
    const did = domainDid.value;
    if (!did) return;
    verifying.value = true;
    error.value = "";
    verifiedDid.value = null;
    try {
        await fetchFromSelf("/app/handles/verify-external", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ did }),
        });
        if (did === domainDid.value) verifiedDid.value = did;
    } catch (cause) {
        error.value = String(cause);
    } finally {
        verifying.value = false;
    }
}

async function replaceHandle(identifier: string) {
    await fetchFromSelf("/app/handles/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
    });
    await refreshAccounts().catch(console.error);
    await router.push({ name: "home", hash: "#handle" });
    return true;
}

async function replaceLocalHandle(identifier: string) {
    if (actor.value?.rotationKey) return replaceHandle(identifier);
    pendingLocalName.value = identifier;
    return false;
}

async function replaceExternalActorHandle() {
    const identifier = choice.value === "local" ? pendingLocalName.value : verifiedDid.value;
    if (!identifier) return;
    replacing.value = true;
    error.value = "";
    try {
        await replaceHandle(identifier);
    } catch (cause) {
        error.value = String(cause);
    } finally {
        replacing.value = false;
    }
}

async function replaceCustomHandle() {
    if (!verifiedDid.value || verifiedDid.value !== domainDid.value) return;
    replacing.value = true;
    error.value = "";
    try {
        await replaceHandle(verifiedDid.value);
    } catch (cause) {
        error.value = String(cause);
    } finally {
        replacing.value = false;
    }
}
</script>

<style scoped>
pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
</style>
