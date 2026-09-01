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
                <template v-else-if="hasUnauthorizedRequestedScope">
                    <p>
                        <em>
                            The account you are logged in as does not have
                            access to the requested services.
                        </em>
                    </p>

                    <p v-if="accountHandlesWithActor.length === 0">
                        There are no handles associated with the logged in
                        account. Please log out and back in with a different
                        account.
                    </p>
                    <template v-else>
                        <p>
                            Your logged-in account is associated with the
                            following
                            <RouterLink
                                :to="{ name: 'handles' }"
                                target="_blank"
                            >
                                handles</RouterLink
                            >:
                        </p>
                        <ul class="account-handles">
                            <li
                                v-for="handle in accountHandlesWithActor"
                                :key="handle"
                            >
                                <button
                                    type="button"
                                    @click="handleSelectHandle(handle)"
                                >
                                    Continue as <code>{{ handle }}</code>
                                </button>
                            </li>
                        </ul>

                        <p>
                            If you are trying to access services associated with
                            a handle not listed here, please log out and log
                            back in with the right account.
                        </p>
                    </template>

                    <Logout />
                    <button class="secondary" @click="handleDeny">
                        Cancel
                    </button>
                </template>
                <template v-else>
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
import { fetchFromSelf, isLoggedIn } from "../globals";
import { useRouter } from "vue-router";
import { serviceIdToUrl } from "../../../shared/service-urls";
import { didToHandle, handleNameToHandle } from "../../../shared/did-schemas";
import "./floating-panel.css";
import Logout from "./Logout.vue";
import type { Actor } from "../actors/types";
import { fetchActorDidData } from "../actors/plc-directory";
import type { Handle } from "../handles/types";

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

function handlesFromAlsoKnownAs(alsoKnownAs: Array<string> | undefined) {
    if (!alsoKnownAs) return [];
    return alsoKnownAs
        .filter((value) => value.startsWith("did:web:"))
        .map((did) => didToHandle(did));
}

function serviceKindFromEndpoint(endpoint: string) {
    const baseHost = window.location.host;
    const sharedInboxEndpoint = serviceIdToUrl("shared", "inbox", baseHost);
    if (endpoint === sharedInboxEndpoint) return "shared";
    if (endpoint.startsWith(`https://${baseHost}/s/`)) return "bucket";
    if (endpoint.startsWith(`https://${baseHost}/i/`)) return "inbox";
    return "other";
}

const userServiceEndpoints = ref<Array<string> | undefined>(undefined);
const endpointToActorName = ref(new Map<string, string>());
const accountHandles = ref<Array<string>>([]);
const handleToActorDid = ref(new Map<string, string>());

async function loadUserServiceEndpoints() {
    userServiceEndpoints.value = undefined;
    endpointToActorName.value = new Map();
    accountHandles.value = [];
    handleToActorDid.value = new Map();
    const baseHost = window.location.host;

    try {
        const [bucketServices, inboxServices, actorsResult, handlesResult] =
            (await Promise.all([
                fetchFromSelf("/app/service-instances/bucket/list"),
                fetchFromSelf("/app/service-instances/inbox/list"),
                fetchFromSelf("/app/actors/list"),
                fetchFromSelf("/app/handles/list"),
            ])) as [
                Array<{ serviceId: string; createdAt: number }>,
                Array<{ serviceId: string; createdAt: number }>,
                { actors: Array<Actor> },
                { handles: Array<Handle> },
            ];

        const actorDidData = await Promise.all(
            actorsResult.actors.map((actor) => fetchActorDidData(actor)),
        );
        const actorNames = new Map<string, string>();
        const handleActors = new Map<string, string>();
        const allHandles = new Set(
            handlesResult.handles.map((handle) =>
                handleNameToHandle(handle.name, baseHost),
            ),
        );
        for (const handle of handlesResult.handles) {
            const handleString = handleNameToHandle(handle.name, baseHost);
            const actorDid = handle.alsoKnownAs?.find(
                (value) =>
                    value.startsWith("did:") && !value.startsWith("did:web:"),
            );
            if (actorDid && !handleActors.has(handleString)) {
                handleActors.set(handleString, actorDid);
            }
        }
        for (const [index, actorData] of actorDidData.entries()) {
            const actorDid = actorsResult.actors[index]?.did;
            const displayName = displayNameFromAlsoKnownAs(
                actorData.alsoKnownAs,
            );
            for (const actorHandle of handlesFromAlsoKnownAs(
                actorData.alsoKnownAs,
            )) {
                allHandles.add(actorHandle);
                if (
                    actorDid &&
                    !actorDid.startsWith("did:web:") &&
                    !handleActors.has(actorHandle)
                ) {
                    handleActors.set(actorHandle, actorDid);
                }
            }
            if (!displayName) continue;
            for (const service of Object.values(actorData.services ?? {})) {
                if (!actorNames.has(service.endpoint)) {
                    actorNames.set(service.endpoint, displayName);
                }
            }
        }
        endpointToActorName.value = actorNames;
        handleToActorDid.value = handleActors;
        accountHandles.value = Array.from(allHandles).sort((a, b) =>
            a.localeCompare(b),
        );

        userServiceEndpoints.value = [
            ...bucketServices.map(({ serviceId }) =>
                serviceIdToUrl(serviceId, "bucket", baseHost),
            ),
            ...inboxServices.map(({ serviceId }) =>
                serviceIdToUrl(serviceId, "inbox", baseHost),
            ),
            serviceIdToUrl("shared", "inbox", baseHost),
        ];
    } catch (error) {
        console.error(error);
        userServiceEndpoints.value = [];
    }
}

const hasUnauthorizedRequestedScope = computed(() => {
    if (userServiceEndpoints.value === undefined) return false;
    const ownServices = new Set(userServiceEndpoints.value);
    return requestedScopes.some(
        (requestedScope) => !ownServices.has(requestedScope),
    );
});

const accountHandlesWithActor = computed(() => {
    return accountHandles.value.filter((handle) =>
        handleToActorDid.value.has(handle),
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
    () => isLoggedIn.value,
    (loggedIn) => {
        if (loggedIn === true) {
            loadUserServiceEndpoints();
        } else {
            userServiceEndpoints.value = undefined;
            endpointToActorName.value = new Map();
            accountHandles.value = [];
            handleToActorDid.value = new Map();
        }
    },
    { immediate: true },
);

function handleSelectHandle(handle: string) {
    if (!redirectUriObject) return router.push("/");
    const actorDid = handleToActorDid.value.get(handle);
    if (!actorDid) return;
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
}
</style>
