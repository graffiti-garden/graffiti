<template>
    <dialog open>
        <header>
            <h1>
                Authorize
                <code>{{ redirectUriObject?.hostname }}</code>
                to access your Graffiti data?
            </h1>
        </header>

        <main>
            <template v-if="isLoggedIn === false">
                <Login />
            </template>
            <template v-else-if="isLoggedIn === true">
                <template v-if="userServiceEndpoints === undefined">
                    <p><em>Loading...</em></p>
                </template>
                <template v-else-if="userServiceEndpoints === null">
                    <p><em>Could not check service access.</em></p>
                    <button @click="loadUserServiceEndpoints">Retry</button>
                    <button class="secondary" @click="handleDeny">Cancel</button>
                </template>
                <template v-else-if="hasUnauthorizedRequestedScope">
                    <p>
                        <em>
                            None of your logged-in accounts has access to the
                            requested services.
                        </em>
                    </p>

                    <Login class="secondary account-login">
                        Log in with another account
                    </Login>

                    <template v-if="accountOptions.length">
                        <p class="account-or">or</p>
                        <ul class="account-handles">
                            <li
                                v-for="account in accountOptions"
                                :key="account.id"
                            >
                                <button
                                    :disabled="!account.did"
                                    @click="handleSelectActor(account.did)"
                                >
                                    Continue as <code>{{ account.label }}</code>
                                </button>
                            </li>
                        </ul>
                    </template>

                    <button class="secondary" @click="handleDeny">
                        Cancel
                    </button>
                </template>
                <template v-else>
                    <p>Continuing as {{ accountLabel(currentAccount) }}</p>
                    <section class="requested-scopes">
                        <p v-if="requestedScopes.length === 0">
                            <em>No scopes were requested.</em>
                        </p>
                        <details v-else>
                            <summary>Review requested access</summary>
                            <p>Approval will grant access to:</p>
                            <ul>
                                <li
                                    v-for="(
                                        scope, index
                                    ) in requestedScopeDisplay"
                                    :key="`${scope.endpoint}-${index}`"
                                >
                                    <a
                                        :href="`${scope.endpoint}/docs`"
                                        target="_blank"
                                    >
                                        {{ scope.label }}
                                    </a>
                                </li>
                            </ul>
                        </details>
                    </section>
                    <button @click="handleApprove">Approve</button>
                    <button class="secondary" @click="handleDeny">Deny</button>
                </template>
            </template>
            <template v-else> Loading... </template>
        </main>
    </dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Login from "./Login.vue";
import {
    accountLabel,
    accounts,
    currentAccount,
    fetchFromSelf,
    isLoggedIn,
    selectedAccount,
    selectAccount,
} from "../globals";
import { useRouter } from "vue-router";
import { serviceIdToUrl } from "../../../shared/service-urls";
import { didToHandle } from "../../../shared/did-schemas";
import "./floating-panel.css";
import type { Actor } from "../actors/types";
import { fetchActorDidData } from "../actors/plc-directory";

// Extract the redirectUri from the search params
const redirectUri = new URLSearchParams(window.location.search).get(
    "redirect_uri",
);

// If there is no redirect URI, redirect to the home page
const router = useRouter();

let redirectUriObject: URL | undefined;
if (redirectUri === null) {
    router.push("/");
} else {
    try {
        redirectUriObject = new URL(redirectUri);
    } catch (error) {
        console.error("Invalid redirect URI");
        console.error(error);
        router.push("/");
    }
}

// Also get the state
const searchParams = new URLSearchParams(window.location.search);
const state = searchParams.get("state") ?? "";

const requestedScopes = (searchParams.get("scope") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((scopeSegment) => {
        try {
            return decodeURIComponent(scopeSegment);
        } catch (error) {
            return scopeSegment;
        }
    });

function displayNameFromAlsoKnownAs(alsoKnownAs: Array<string> | undefined) {
    if (!alsoKnownAs?.length) return undefined;
    const did = alsoKnownAs.find((value) => value.startsWith("did:web:"));
    if (!did) return undefined;
    return didToHandle(did);
}

function serviceKindFromEndpoint(endpoint: string) {
    const baseHost = window.location.host;
    const sharedInboxEndpoint = serviceIdToUrl("shared", "inbox", baseHost);
    if (endpoint === sharedInboxEndpoint) return "shared";
    if (endpoint.startsWith(`https://${baseHost}/s/`)) return "bucket";
    if (endpoint.startsWith(`https://${baseHost}/i/`)) return "inbox";
    return "other";
}

const userServiceEndpoints = ref<Array<string> | null | undefined>(undefined);
const endpointToActorName = ref(new Map<string, string>());
const accountOptions = ref<Array<{ id: number; label: string; did?: string }>>([]);

async function serviceEndpointsForAccount(accountId: number) {
    const headers = { "X-Graffiti-Account": String(accountId) };
    const [bucketServices, inboxServices] = (await Promise.all([
        fetchFromSelf("/app/service-instances/bucket/list", { headers }),
        fetchFromSelf("/app/service-instances/inbox/list", { headers }),
    ])) as [Array<{ serviceId: string }>, Array<{ serviceId: string }>];
    const baseHost = window.location.host;
    return [
        ...bucketServices.map(({ serviceId }) =>
            serviceIdToUrl(serviceId, "bucket", baseHost),
        ),
        ...inboxServices.map(({ serviceId }) =>
            serviceIdToUrl(serviceId, "inbox", baseHost),
        ),
        serviceIdToUrl("shared", "inbox", baseHost),
    ];
}

async function actorsForAccount(accountId: number) {
    const { actors } = (await fetchFromSelf("/app/actors/list", {
        headers: { "X-Graffiti-Account": String(accountId) },
    })) as { actors: Array<Actor> };
    return actors;
}

async function loadActorNames(accountId: number) {
    try {
        const actors = await actorsForAccount(accountId);
        const actorDidData = await Promise.all(
            actors.map((actor) => fetchActorDidData(actor)),
        );
        if (selectedAccount.value !== accountId) return;
        const actorNames = new Map<string, string>();
        for (const actorData of actorDidData) {
            const displayName = displayNameFromAlsoKnownAs(
                actorData.alsoKnownAs,
            );
            if (!displayName) continue;
            for (const service of Object.values(actorData.services ?? {})) {
                if (!actorNames.has(service.endpoint)) {
                    actorNames.set(service.endpoint, displayName);
                }
            }
        }
        endpointToActorName.value = actorNames;
    } catch (error) {
        console.error(error);
    }
}

async function loadAccountOptions(accountId: number) {
    const options = await Promise.all(
        (accounts.value ?? []).map(async (account) => {
            let did: string | undefined;
            try {
                did = (await actorsForAccount(account.id))[0]?.did;
            } catch (error) {
                console.error(error);
            }
            return { id: account.id, label: accountLabel(account), did };
        }),
    );
    if (selectedAccount.value === accountId) accountOptions.value = options;
}

async function loadUserServiceEndpoints() {
    const accountId = selectedAccount.value;
    if (accountId === undefined) return;
    userServiceEndpoints.value = undefined;
    endpointToActorName.value = new Map();
    accountOptions.value = [];

    try {
        const serviceEndpoints = await serviceEndpointsForAccount(accountId);

        // If this account lacks a requested service, check whether another
        // logged-in account can approve the whole request.
        if (selectedAccount.value !== accountId) return;
        const lacksRequestedService = requestedScopes.some(
            (scope) => !serviceEndpoints.includes(scope),
        );
        if (lacksRequestedService) {
            for (const account of accounts.value ?? []) {
                if (account.id === accountId) continue;
                const otherServices = await serviceEndpointsForAccount(
                    account.id,
                );
                if (selectedAccount.value !== accountId) return;
                if (
                    requestedScopes.every((scope) =>
                        otherServices.includes(scope),
                    )
                ) {
                    selectAccount(account.id);
                    return;
                }
            }
        }

        if (selectedAccount.value !== accountId) return;
        userServiceEndpoints.value = serviceEndpoints;
        // Actor details are only needed for display, not for checking access.
        if (lacksRequestedService) {
            void loadAccountOptions(accountId);
        } else {
            void loadActorNames(accountId);
        }
    } catch (error) {
        if (selectedAccount.value !== accountId) return;
        console.error(error);
        userServiceEndpoints.value = null;
    }
}

const hasUnauthorizedRequestedScope = computed(() => {
    if (
        userServiceEndpoints.value === undefined ||
        userServiceEndpoints.value === null
    ) return false;
    const ownServices = new Set(userServiceEndpoints.value);
    return requestedScopes.some(
        (requestedScope) => !ownServices.has(requestedScope),
    );
});

const requestedScopeDisplay = computed(() => {
    return requestedScopes.map((endpoint) => {
        const kind = serviceKindFromEndpoint(endpoint);

        if (kind === "shared") {
            return {
                endpoint,
                label: `The shared ${window.location.host} inbox`,
            };
        }

        const actorName = endpointToActorName.value.get(endpoint);
        if (actorName && kind === "bucket") {
            return {
                endpoint,
                label: `${actorName}'s storage bucket`,
            };
        }
        if (actorName && kind === "inbox") {
            return {
                endpoint,
                label: `${actorName}'s personal inbox`,
            };
        }
        if (kind === "bucket") {
            return {
                endpoint,
                label: "One of your storage buckets",
            };
        }
        if (kind === "inbox") {
            return {
                endpoint,
                label: "One of your personal inboxes",
            };
        }

        return {
            endpoint,
            label: "One of your services",
        };
    });
});

watch(
    [isLoggedIn, selectedAccount],
    ([loggedIn]) => {
        if (loggedIn === true) {
            loadUserServiceEndpoints();
        } else {
            userServiceEndpoints.value = undefined;
            endpointToActorName.value = new Map();
            accountOptions.value = [];
        }
    },
    { immediate: true },
);

function handleSelectActor(actorDid: string | undefined) {
    if (!actorDid) return;
    if (!redirectUriObject) return router.push("/");
    const redirectUrl = new URL(redirectUriObject.toString());
    redirectUrl.searchParams.set("actor", encodeURIComponent(actorDid));
    window.location.replace(redirectUrl.toString());
}

function handleApprove() {
    // On approval, redirect to the authorize endpoint
    if (!redirectUriObject) return router.push("/");
    const url = new URL("/app/oauth/authorize", window.location.origin);
    url.searchParams.set("redirect_uri", redirectUriObject.toString());
    url.searchParams.set("state", state);
    if (selectedAccount.value) {
        url.searchParams.set("account", String(selectedAccount.value));
    }
    window.location.replace(url.toString());
}

function handleDeny() {
    // On rejection, redirect back with an error
    if (!redirectUriObject) return router.push("/");
    redirectUriObject.searchParams.set("error", "access_denied");
    redirectUriObject.searchParams.set(
        "error_description",
        "The user denied the request",
    );
    window.location.replace(redirectUriObject.toString());
}
</script>

<style scoped>
.account-login,
.account-or {
    margin: 0;
}

.requested-scopes {
    width: 100%;
    text-align: left;
    margin: 0;
}

.requested-scopes details {
    width: 100%;
    border: 1px solid var(--pico-muted-border-color);
    border-radius: var(--pico-border-radius);
    background: color-mix(
        in srgb,
        var(--pico-card-background-color) 80%,
        var(--pico-background-color)
    );
    padding: 0.75rem 1rem;
}

.requested-scopes summary,
.requested-scopes ul,
.requested-scopes li {
    text-align: left;
}

.requested-scopes summary {
    cursor: pointer;
    color: var(--pico-secondary);
    font-weight: 400;
}

.requested-scopes summary:focus {
    color: var(--pico-secondary);
}

.requested-scopes summary:hover {
    color: var(--pico-color);
}

.account-handles {
    width: 100%;
    text-align: left;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.account-handles li,
.account-handles button {
    margin: 0;
}

.account-handles li {
    list-style: none;
}
</style>
