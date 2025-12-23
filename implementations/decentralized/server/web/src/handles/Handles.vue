<template>
    <p v-if="handles === undefined">
        <em>Loading...</em>
    </p>
    <template v-else-if="handles === null">
        <p><em>Error loading handles!</em></p>
        <button @click="fetchHandles">Retry</button>
    </template>
    <ul v-else>
        <li v-for="handle in handles" :key="handle.name">
            <article>
                <a :href="handleToLink(handle.name)" target="_blank">
                    <h2>
                        {{ handleNameToHandle(handle.name) }}
                    </h2>
                </a>
                <pre><code>{{ JSON.stringify(constructDidDocument({
                  did: handleNameToDid(handle.name),
                  services: handle.services,
                  alsoKnownAs: handle.alsoKnownAs
                }), null, 2) }}</code></pre>
                <nav>
                    <ul>
                        <li>
                            <button
                                :disabled="deleting"
                                @click="deleteHandle(handle.name)"
                            >
                                Delete
                            </button>
                        </li>
                    </ul>
                </nav>
            </article>
        </li>
    </ul>
    <RouterLink to="/register-handle">New Actor</RouterLink>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromAPI } from "../globals";
import {
    OptionalAlsoKnownAsSchema,
    OptionalServicesSchema,
    constructDidDocument,
    handleNameToHandle,
    handleNameToDid,
} from "../../../shared/did-schemas";
import { z } from "zod";

interface Handle {
    name: string;
    createdAt: number;
    alsoKnownAs: z.infer<typeof OptionalAlsoKnownAsSchema>;
    services: z.infer<typeof OptionalServicesSchema>;
}

function handleToLink(handleName: string) {
    return `${window.location.protocol}//${handleNameToHandle(handleName)}/.well-known/did.json`;
}

const handles = ref<Array<Handle> | undefined | null>(undefined);
function fetchHandles() {
    handles.value = undefined;
    fetchFromAPI("/handles/list")
        .then((value: { handles: Array<Handle> }) => {
            handles.value = value.handles.sort(
                (a, b) => a.createdAt - b.createdAt,
            );
        })
        .catch((error) => {
            console.error(error);
            handles.value = null;
        });
}
fetchHandles();

const deleting = ref(false);
function deleteHandle(handleName: string) {
    const handle = handleNameToHandle(handleName);
    if (
        !confirm(
            `Are you sure you want to delete "${handle}"? It may be claimed by another person.`,
        )
    )
        return;
    deleting.value = true;
    fetchFromAPI("/handles/delete", {
        method: "POST",
        body: JSON.stringify({ name: handleName }),
    })
        .then(() => {
            handles.value?.splice(
                handles.value.findIndex((h) => h.name === handleName),
                1,
            );
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            deleting.value = false;
        });
}
</script>
