<template>
    <article>
        <h2>
            <a :href="`https://plc.directory/${actor.did}`" target="_blank">
                {{ actor.did }}
            </a>
            <CopyButton :text="actor.did" />
        </h2>

        <template v-if="!editing">
            <nav>
                <ul>
                    <li v-if="actor.rotationKey">
                        <button :disabled="loadingEditor" @click="editActor">
                            {{ loadingEditor ? "Loading..." : "Edit" }}
                        </button>
                    </li>
                    <li v-if="actor.rotationKey">
                        <button :disabled="exporting" @click="exportActor">
                            {{ exporting ? "Exporting..." : "Export private key" }}
                        </button>
                    </li>
                    <li v-if="actor.rotationKey">
                        <button
                            :disabled="!exported || removingKey"
                            @click="stopManagingKey"
                        >
                            {{ removingKey ? "Removing key..." : exported ? "Manage private key myself" : "Manage private key myself (export first)" }}
                        </button>
                    </li>
                    <li>
                        <button v-if="actor.rotationKey && !exported" disabled>
                            Replace actor (export first)
                        </button>
                        <RouterLink
                            v-else
                            :to="{ name: 'replace-actor', state: { exportedActorDid: exported ? actor.did : undefined } }"
                            role="button"
                        >
                            Replace actor
                        </RouterLink>
                    </li>
                </ul>
            </nav>
            <p v-if="!actor.rotationKey">
                This actor's private key is managed elsewhere.
            </p>
        </template>
        <form v-else @submit.prevent="saveActor">
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
import { ref, toRef } from "vue";
import type { Actor } from "./types";
import {
    type OptionalAlsoKnownAs,
    type OptionalServices,
} from "../../../shared/did-schemas";
import EditDid from "./EditDid.vue";
import { fetchFromSelf } from "../globals";
import CopyButton from "../utils/CopyButton.vue";
import { fetchActorDidData } from "./plc-directory";
import { exportPrivateKey } from "./export-private-key";

const props = defineProps<{
    actor: Actor;
}>();
const actor = toRef(props, "actor");
const host = window.location.host;

const editing = ref(false);
const loadingEditor = ref(false);
const editingAlsoKnownAs = ref<OptionalAlsoKnownAs>(undefined);
const editingServices = ref<OptionalServices>(undefined);
async function editActor() {
    loadingEditor.value = true;
    try {
        const data = await fetchActorDidData(actor.value);
        editingAlsoKnownAs.value = data.alsoKnownAs;
        editingServices.value = data.services;
        editing.value = true;
    } catch (error) {
        alert(error);
    } finally {
        loadingEditor.value = false;
    }
}

const saving = ref(false);
function saveActor() {
    if (!editing.value) return;
    saving.value = true;

    fetchFromSelf(`/app/actors/actor/${actor.value.did}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            alsoKnownAs: editingAlsoKnownAs.value,
            services: editingServices.value,
        }),
    })
        .then(() => {
            editing.value = false;
            exported.value = false;
        })
        .catch((error) => {
            alert(error);
        })
        .finally(() => {
            saving.value = false;
        });
}

const exporting = ref(false);
const exported = ref(false);
async function exportActor() {
    exporting.value = true;
    try {
        if (await exportPrivateKey(actor.value.did)) exported.value = true;
    } catch (error) {
        alert(error);
    } finally {
        exporting.value = false;
    }
}

const removingKey = ref(false);
function stopManagingKey() {
    removingKey.value = true;
    if (
        !confirm(
            `Remove ${host}'s copy of your actor's private key? The actor will remain on your account, but you will need the exported key to edit its DID elsewhere.`,
        )
    ) {
        removingKey.value = false;
        return;
    }

    fetchFromSelf(`/app/actors/actor/${actor.value.did}/key`, {
        method: "DELETE",
    })
        .then(() => {
            actor.value.rotationKey = null;
            exported.value = false;
        })
        .catch((error) => {
            alert(error);
        })
        .finally(() => {
            removingKey.value = false;
        });
}
</script>
