<template>
    <h2>Create a Graffiti identity</h2>
    <ol start="2">
        <li>
            <RegisterHandle :onRegister="onRegister" :onCancel="onCancel" />
        </li>
        <li v-if="handleName && !bucketId" v-scroll-into-view>
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
        <li v-if="handleName && bucketId && !inboxId" v-scroll-into-view>
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
            v-if="handleName && bucketId && inboxId && !actor"
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
            v-if="handleName && bucketId && inboxId && actor && !linked"
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
import { fetchFromSelf } from "./globals";
import { serviceIdToUrl } from "../../shared/service-urls";
import StatusIcon from "./utils/StatusIcon.vue";
import { useRouter } from "vue-router";
import { handleNameToHandle, handleNameToDid } from "../../shared/did-schemas";

const redirectUri = new URLSearchParams(window.location.search).get(
    "redirect_uri",
);
const redirect = computed(() => {
    if (redirectUri) {
        try {
            const url = new URL(redirectUri);
            if (handleName.value) {
                url.searchParams.set(
                    "handle",
                    handleNameToHandle(handleName.value, baseHost),
                );
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
const bucketId = ref<string | undefined>(undefined);
const inboxId = ref<string | undefined>(undefined);
const actor = ref<string | undefined>(undefined);
const linked = ref<boolean>(false);

async function onRegister(name: string) {
    handleName.value = name;
    createBucket();
}

const router = useRouter();
async function onCancel() {
    if (redirect.value) {
        window.location.href = redirect.value;
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
ol > li:has(> header) {
    display: contents;
}

ol > li > header > h3::before {
    content: "1. ";
}

ol {
    list-style-position: inside;
    padding-left: 0;
    margin-top: 2rem;
}

a[role="button"].return {
    display: block;
    margin-top: 3rem;
    margin-bottom: 1rem;
    width: 100%;
}
</style>
