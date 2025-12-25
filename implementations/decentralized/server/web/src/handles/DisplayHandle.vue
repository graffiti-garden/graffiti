<template>
    <article>
        <a :href="handleToLink(handle.name)" target="_blank">
            <h2>
                {{ handleNameToHandle(handle.name) }}
            </h2>
        </a>
        <template v-if="!editing">
            <pre><code>{{ JSON.stringify(constructDidDocument({
            did: handleNameToDid(handle.name),
            services: handle.services,
            alsoKnownAs: handle.alsoKnownAs
            }), null, 2) }}</code></pre>
            <nav>
                <ul>
                    <li>
                        <button @click="editing = true">Edit</button>
                    </li>
                    <li>
                        <button
                            :disabled="unregistering"
                            @click="unregisterHandle"
                        >
                            {{
                                unregistering
                                    ? "Unregistering..."
                                    : "Unregister"
                            }}
                        </button>
                    </li>
                </ul>
            </nav>
        </template>
        <form v-else @submit.prevent="saveHandle">
            <EditDid
                v-model:alsoKnownAs="editingAlsoKnownAs"
                v-model:services="editingServices"
            />
            <button type="submit" :disabled="saving">
                {{ saving ? "Saving..." : "Save" }}
            </button>
            <button type="button" @click="editing = false">Cancel</button>
        </form>
    </article>
</template>

<script setup lang="ts">
import { ref, toRef, watch } from "vue";
import {
    constructDidDocument,
    handleNameToDid,
    handleNameToHandle,
    type OptionalAlsoKnownAs,
    type OptionalServices,
} from "../../../shared/did-schemas";
import type { Handle } from "./types";
import { fetchFromAPI } from "../globals";
import EditDid from "../actors/EditDid.vue";

const props = defineProps<{
    handle: Handle;
    onUnregister?: () => void;
}>();
const handle = ref<Handle>(props.handle);

function handleToLink(handleName: string) {
    return `${window.location.protocol}//${handleNameToHandle(handleName)}/.well-known/did.json`;
}

const editing = ref(false);
const editingAlsoKnownAs = ref<OptionalAlsoKnownAs>(undefined);
const editingServices = ref<OptionalServices>(undefined);
watch(editing, () => {
    if (editing.value) {
        editingAlsoKnownAs.value = handle.value.alsoKnownAs;
        editingServices.value = handle.value.services;
    }
});

const saving = ref(false);
function saveHandle() {
    if (!editing.value) return;
    saving.value = true;
    const name = handle.value.name;
    const alsoKnownAs = editingAlsoKnownAs.value;
    const services = editingServices.value;
    fetchFromAPI("/handles/update", {
        method: "POST",
        body: JSON.stringify({ name, alsoKnownAs, services }),
    })
        .then(() => {
            editing.value = false;
            handle.value = {
                ...handle.value,
                alsoKnownAs,
                services,
            };
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            saving.value = false;
        });
}

const unregistering = ref(false);
function unregisterHandle() {
    const name = handle.value.name;
    if (
        !confirm(
            `Are you sure you want to unregister "${handleNameToHandle(name)}"? It may be registered by another person.`,
        )
    )
        return;
    unregistering.value = true;
    fetchFromAPI("/handles/delete", {
        method: "POST",
        body: JSON.stringify({ name }),
    })
        .then(() => {
            props.onUnregister?.();
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            unregistering.value = false;
        });
}
</script>
