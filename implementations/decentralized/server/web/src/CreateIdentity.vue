<template>
    <h2>Create a Graffiti identity</h2>
    <ol>
        <li>
            <RegisterHandle
                v-if="!passkeyCreated"
                :onRegister="registerAccount"
                :onCancel="onCancel"
                createAccount
            />
            <template v-else>
                Created account with handle
                <code>{{ handleNameToHandle(handleName!, baseHost) }}</code>
                <StatusIcon status="ok" />
            </template>
        </li>
        <li v-if="passkeyCreated && !bucketId" v-scroll-into-view>
            <span v-if="errorString === null">
                Creating storage bucket...
                <StatusIcon status="loading" />
            </span>
            <span v-else>
                Error creating storage bucket
                <StatusIcon status="error" />
                {{ errorString }}
                <button @click="createBucket">Retry</button>
            </span>
        </li>
        <li v-else-if="bucketId">
            Created storage bucket
            <StatusIcon status="ok" />
        </li>
        <li v-if="passkeyCreated && bucketId && !inboxId" v-scroll-into-view>
            <span v-if="errorString === null">
                Creating inbox...
                <StatusIcon status="loading" />
            </span>
            <span v-else>
                Error creating inbox
                <StatusIcon status="error" />
                {{ errorString }}
                <button @click="createInbox">Retry</button>
            </span>
        </li>
        <li v-else-if="inboxId">
            Created inbox
            <StatusIcon status="ok" />
        </li>
        <li
            v-if="passkeyCreated && bucketId && inboxId && !actor"
            v-scroll-into-view
        >
            <span v-if="errorString === null">
                Creating actor...
                <StatusIcon status="loading" />
            </span>
            <span v-else>
                Error creating actor
                <StatusIcon status="error" />
                {{ errorString }}
                <button @click="createActor">Retry</button>
            </span>
        </li>
        <li v-else-if="actor">
            Created actor
            <StatusIcon status="ok" />
        </li>
        <li
            v-if="passkeyCreated && bucketId && inboxId && actor && !linked"
            v-scroll-into-view
        >
            <span v-if="errorString === null">
                Linking actor to handle...
                <StatusIcon status="loading" />
            </span>
            <span v-else>
                Error linking actor to handle
                <StatusIcon status="error" />
                {{ errorString }}
                <button @click="linkActorToHandle">Retry</button>
            </span>
        </li>
        <li v-else-if="linked">
            Linked actor to handle
            <StatusIcon status="ok" />
        </li>
    </ol>

    <template v-if="linked">
        <p>
            Graffiti identity created with handle
            <code>{{ handleNameToHandle(handleName!, baseHost) }}</code>
        </p>

        <template v-if="redirect">
            <a class="return" role="button" :href="redirect" v-focus>
                Return to application
            </a>
            <aside v-scroll-into-view>
                You may return to <a :href="baseOrigin">{{ baseHost }}</a>
                at any time to manage your identity or migrate to another
                provider.
            </aside>
        </template>
        <RouterLink
            v-else
            class="return"
            role="button"
            :to="{ name: 'home' }"
            v-focus
            v-scroll-into-view
        >
            Return to home page
        </RouterLink>
    </template>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import RegisterHandle from "./handles/RegisterHandle.vue";
import { fetchFromSelf, refreshAccounts, selectAccount } from "./globals";
import { startRegistration } from "@simplewebauthn/browser";
import { serviceIdToUrl } from "../../shared/service-urls";
import StatusIcon from "./utils/StatusIcon.vue";
import { useRouter } from "vue-router";
import { handleNameToHandle, handleNameToDid } from "../../shared/did-schemas";

const redirectUriEncoded = new URLSearchParams(window.location.search).get(
    "redirect_uri",
);
const redirect = computed(() => {
    if (redirectUriEncoded) {
        try {
            const redirectUri = redirectUriEncoded
                ? decodeURIComponent(redirectUriEncoded)
                : redirectUriEncoded;
            const url = new URL(redirectUri);
            if (actor.value) {
                url.searchParams.set("actor", encodeURIComponent(actor.value));
            }
            return url.toString();
        } catch (e) {
            return null;
        }
    }
    return null;
});

const baseOrigin = window.location.origin;
const baseHost = window.location.host;

const errorString = ref<string | null>(null);

const handleName = ref<string | undefined>(undefined);
const passkeyCreated = ref(false);
const bucketId = ref<string | undefined>(undefined);
const inboxId = ref<string | undefined>(undefined);
const actor = ref<string | undefined>(undefined);
const linked = ref<boolean>(false);

async function registerAccount(name: string) {
    // Account creation uses the temporary session, even when another account
    // is already selected in this browser.
    const fetchForNewAccount = (path: string, options?: RequestInit) =>
        fetchFromSelf(path, options, false);

    let optionsJSON: any;
    try {
        optionsJSON = await fetchForNewAccount("/app/webauthn/register/challenge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
    } catch (error: any) {
        alert(`Failed to register passkey. ${error.message}`);
        return false;
    }

    let response;
    try {
        response = await startRegistration({ optionsJSON });
    } catch (error) {
        // Cancelling the prompt leaves the handle field editable.
        console.error(error);
        return false;
    }

    let accountId: number;
    try {
        const result = await fetchForNewAccount("/app/webauthn/register/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
        });
        accountId = result.accountId;
    } catch (error: any) {
        alert(`Failed to register passkey. ${error.message}`);
        return false;
    }

    // The account exists now, even if reloading the account list fails.
    selectAccount(accountId);
    try {
        await refreshAccounts(accountId);
    } catch (error) {
        console.error("Failed to refresh accounts after registration.", error);
    }

    handleName.value = name;
    passkeyCreated.value = true;
    createBucket();
    return true;
}

const router = useRouter();
async function onCancel() {
    if (redirect.value) {
        window.location.replace(redirect.value);
    } else {
        router.push({ name: "home" });
    }
}

async function createBucket() {
    errorString.value = null;

    bucketId.value = await fetchFromSelf(
        `/app/service-instances/bucket/create`,
        {
            method: "POST",
        },
    )
        .then(({ serviceId }) => serviceId as string)
        .catch((error) => {
            errorString.value = error.message;
            throw error;
        });

    createInbox();
}

async function createInbox() {
    errorString.value = null;

    inboxId.value = await fetchFromSelf(`/app/service-instances/inbox/create`, {
        method: "POST",
    })
        .then(({ serviceId }) => serviceId as string)
        .catch((error) => {
            errorString.value = error.message;
            throw error;
        });

    createActor();
}

async function createActor() {
    errorString.value = null;

    actor.value = await fetchFromSelf("/app/actors/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            alsoKnownAs: [handleNameToDid(handleName.value!, baseHost)],
            services: {
                graffitiStorageBucket: {
                    type: "GraffitiStorageBucket",
                    endpoint: serviceIdToUrl(
                        bucketId.value!,
                        "bucket",
                        baseHost,
                    ),
                },
                graffitiPersonalInbox: {
                    type: "GraffitiInbox",
                    endpoint: serviceIdToUrl(inboxId.value!, "inbox", baseHost),
                },
                graffitiSharedInbox_0: {
                    type: "GraffitiInbox",
                    endpoint: serviceIdToUrl("shared", "inbox", baseHost),
                },
            },
        }),
    })
        .then(({ did }) => did as string)
        .catch((error) => {
            errorString.value = error.message;
            throw error;
        });

    linkActorToHandle();
}

async function linkActorToHandle() {
    errorString.value = null;

    await fetchFromSelf(`/app/handles/handle/${handleName.value}`, {
        method: "PUT",
        body: JSON.stringify({ alsoKnownAs: [actor.value] }),
        headers: {
            "Content-Type": "application/json",
        },
    }).catch((error) => {
        errorString.value = error.message;
        throw error;
    });

    linked.value = true;
}
</script>

<style>
ol {
    padding-left: 1.5rem;
    margin-top: 2rem;
}

/* Match the heading while choosing a handle; use a normal marker once created. */
ol > li:first-child:has(> header)::marker {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--pico-h3-color);
}

a[role="button"].return {
    display: block;
    margin-top: 3rem;
    margin-bottom: 1rem;
    width: 100%;
}
</style>
