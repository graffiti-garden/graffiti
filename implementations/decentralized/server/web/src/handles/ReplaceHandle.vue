<template>
    <p><RouterLink :to="{ name: 'handles' }">← Back to handle</RouterLink></p>
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
                <button type="button" :aria-pressed="choice === 'local'" @click="choice = 'local'">
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
            <RegisterHandle replace :onRegister="replaceHandle" />
        </li>

        <li v-else-if="choice === 'custom'" v-scroll-into-view>
            <h3>Set up your custom domain</h3>
            <p v-if="actor === undefined"><em>Loading actor...</em></p>
            <p v-else-if="actorError" role="alert">{{ actorError }}</p>
            <p v-else-if="actor === null">
                Create or import an <RouterLink :to="{ name: 'actors' }">actor</RouterLink>
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
                    <p>Once the file is available, verify it before replacing your handle.</p>
                    <button :disabled="verifying" type="submit">
                        {{ verifying ? "Verifying..." : "Verify domain" }}
                    </button>
                </template>
            </form>
            <p v-if="error" role="alert">{{ error }}</p>
        </li>

        <li v-if="choice === 'custom' && verifiedDid" v-scroll-into-view>
            <h3>Replace handle</h3>
            <p>Domain verified.</p>
            <button :disabled="replacing" @click="replaceCustomHandle">
                {{ replacing ? "Replacing handle..." : "Replace handle" }}
            </button>
        </li>
    </ol>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { constructDidDocument, didWebToUrl } from "../../../shared/did-schemas";
import { fetchFromSelf, refreshAccounts } from "../globals";
import CopyButton from "../utils/CopyButton.vue";
import RegisterHandle from "./RegisterHandle.vue";

const router = useRouter();
const baseHost = window.location.host;
const choice = ref<"local" | "custom" | null>(null);
const domain = ref("");
const actor = ref<string | null | undefined>(undefined);
const actorError = ref("");
const error = ref("");
const verifying = ref(false);
const replacing = ref(false);
const verifiedDid = ref<string | null>(null);

async function chooseCustom() {
    choice.value = "custom";
    actor.value = undefined;
    actorError.value = "";
    error.value = "";
    verifiedDid.value = null;
    try {
        const result: { actors: Array<{ did: string }> } = await fetchFromSelf("/app/actors/list");
        actor.value = result.actors[0]?.did ?? null;
    } catch (cause) {
        actorError.value = String(cause);
        actor.value = null;
    }
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
        alsoKnownAs: [actor.value],
        services: undefined,
    }), null, 2);
});

watch(domain, () => {
    verifiedDid.value = null;
    error.value = "";
});

async function verifyDomain() {
    const did = domainDid.value;
    if (!did) return;
    verifying.value = true;
    error.value = "";
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
    await router.push({ name: "handles" });
    return true;
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
.choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1rem;
}

.choices button {
    padding: 1.5rem;
    text-align: left;
    color: inherit;
    background: transparent;
    border-color: var(--pico-muted-border-color);
}

.choices button:is(:hover, :focus, [aria-pressed="true"]) {
    border-color: var(--pico-primary);
}

.choices span {
    display: block;
    font-size: 0.85em;
}

.steps > li + li {
    margin-top: 2rem;
}

.steps > li::marker {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--pico-h3-color);
}

pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
</style>
