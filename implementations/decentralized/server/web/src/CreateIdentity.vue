<template>
    <h2>Create Graffiti Identity</h2>
    <ol>
        <li>
            <RegisterHandle :onRegister="onRegister" :onCancel="() => {}" />
        </li>
        <li v-if="handleName && !bucketId" v-scroll-into-view>
            <span v-if="errorString === null">
                Creating storage bucket...
            </span>
            <span v-else>
                Error creating storage bucket: {{ errorString }}
                <button @click="createBucket">Retry</button>
            </span>
        </li>
        <li v-else-if="bucketId">Created storage bucket</li>
        <li v-if="handleName && bucketId && !inboxId" v-scroll-into-view>
            <span v-if="errorString === null"> Creating inbox... </span>
            <span v-else>
                Error creating inbox: {{ errorString }}
                <button @click="createInbox">Retry</button>
            </span>
        </li>
        <li v-else-if="inboxId">Created inbox</li>
        <li
            v-if="handleName && bucketId && inboxId && !actor"
            v-scroll-into-view
        >
            <span v-if="errorString === null"> Creating actor... </span>
            <span v-else>
                Error creating actor: {{ errorString }}
                <button @click="createActor">Retry</button>
            </span>
        </li>
        <li v-else-if="actor">Created actor</li>
        <li
            v-if="handleName && bucketId && inboxId && actor && !linked"
            v-scroll-into-view
        >
            <span v-if="errorString === null">
                Linking actor to handle...
            </span>
            <span v-else>
                Error linking actor to handle: {{ errorString }}
                <button @click="linkActorToHandle">Retry</button>
            </span>
        </li>
        <li v-else-if="linked">Linked actor to handle</li>
    </ol>

    <template v-if="linked">
        <p>
            Graffiti identity created with handle
            <code>{{ `${handleName}.${baseHost}` }}</code>
        </p>

        <a class="return" role="button" href="https://google.com" v-focus>
            Return to application
        </a>
        <aside v-scroll-into-view>
            You may return to <a :href="baseOrigin">{{ baseHost }}</a>
            at any time to manage your identity or migrate it to another
            provider.
        </aside>
    </template>
</template>

<script setup lang="ts">
import { ref } from "vue";
import RegisterHandle from "./handles/RegisterHandle.vue";
import { fetchFromSelf } from "./globals";
import { serviceIdToUrl } from "../../shared/service-urls";

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

    actor.value = "asdf:Asdf";
    //   await fetchFromSelf("/app/actors/create", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //         alsoKnownAs: [`did:web:${handleName.value}.${baseHost}`],
    //         services: {
    //             graffitiStorageBucket: {
    //                 type: "GraffitiStorageBucket",
    //                 endpoint: serviceIdToUrl(
    //                     bucketId.value!,
    //                     "bucket",
    //                     baseHost,
    //                 ),
    //             },
    //             graffitiPersonalInbox: {
    //                 type: "GraffitiInbox",
    //                 endpoint: serviceIdToUrl(inboxId.value!, "inbox", baseHost),
    //             },
    //             graffitiPublicInbox0: {
    //                 type: "GraffitiInbox",
    //                 endpoint: serviceIdToUrl("public", "inbox", baseHost),
    //             },
    //         },
    //     }),
    // })
    //     .then(({ did }) => did as string)
    //     .catch((error) => {
    //         errorString.value = error.message;
    //         throw error;
    //     });

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
    padding-left: 2rem;
    padding-right: 2rem;
    margin-top: 2rem;
}

a[role="button"].return {
    display: block;
    margin-top: 3rem;
    margin-bottom: 1rem;
    width: 100%;
}
</style>
