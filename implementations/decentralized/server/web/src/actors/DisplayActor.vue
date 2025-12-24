<template>
    <article>
        <a :href="`https://plc.directory/${actor.did}`" target="_blank">
            <h2>
                {{ actor.did }}
            </h2>
        </a>
        <p v-if="documentStatus === 'loading'">
            <em>Loading...</em>
        </p>
        <template v-else-if="documentStatus === 'error'">
            <p>
                <em>Error fetching actor document</em>
            </p>
            <button @click="() => fetchActor()">Retry</button>
        </template>
        <template v-else>
            <template v-if="!editing">
                <pre><code>{{ JSON.stringify(
                constructDidDocument({
                    did: actor.did,
                    alsoKnownAs,
                    services
                }),
                null, 2) }}</code></pre>
                <nav>
                    <ul>
                        <li>
                            <button @click="editing = true">Edit</button>
                        </li>
                        <li>
                            <button @click="exportActor">Export</button>
                        </li>
                        <li>
                            <button
                                :disabled="!exported || removing"
                                @click="removeActor"
                            >
                                {{
                                    !exported
                                        ? "Remove (export first)"
                                        : removing
                                          ? "Removing..."
                                          : "Remove"
                                }}
                            </button>
                        </li>
                    </ul>
                </nav>
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
        </template>
    </article>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { Actor } from "./types";
import {
    OptionalAlsoKnownAsSchema,
    OptionalServicesSchema,
    constructDidDocument,
    type OptionalAlsoKnownAs,
    type OptionalServices,
} from "../../../shared/did-schemas";
import EditDid from "./EditDid.vue";
import { fetchFromAPI } from "../globals";

const props = defineProps<{
    actor: Actor;
}>();
let actor = props.actor;

const documentStatus = ref<"loading" | "error" | "success">("loading");
const alsoKnownAs = ref<OptionalAlsoKnownAs>(undefined);
const services = ref<OptionalServices>(undefined);
async function fetchActor() {
    documentStatus.value = "loading";
    let result: Response;
    try {
        result = await fetch(`https://plc.directory/${actor.did}/data`);
    } catch (error) {
        console.error(error);
        documentStatus.value = "error";
        return;
    }
    let json: any;
    try {
        json = await result.json();
    } catch (error) {
        console.error(error);
        documentStatus.value = "error";
        return;
    }

    if (json.did !== actor.did) {
        console.error(`DID mismatch: ${json.did} !== ${actor.did}`);
        documentStatus.value = "error";
        return;
    }
    if (!json.rotationKeys.includes(actor.rotationKey)) {
        console.error(
            `Rotation key mismatch: ${json.rotationKeys} does not include ${actor.rotationKey}`,
        );
        documentStatus.value = "error";
        return;
    }

    try {
        alsoKnownAs.value = OptionalAlsoKnownAsSchema.parse(json.alsoKnownAs);
        services.value = OptionalServicesSchema.parse(json.services);
    } catch (error) {
        console.error(error);
        documentStatus.value = "error";
        return;
    }
    documentStatus.value = "success";
}
fetchActor();

const editing = ref(false);
const editingAlsoKnownAs = ref<OptionalAlsoKnownAs>(undefined);
const editingServices = ref<OptionalServices>(undefined);
watch(editing, () => {
    if (editing.value) {
        editingAlsoKnownAs.value = alsoKnownAs.value;
        editingServices.value = services.value;
    }
});

const saving = ref(false);
function saveActor() {
    if (!editing.value) return;
    saving.value = true;

    fetchFromAPI("/actors/update", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            did: actor.did,
            alsoKnownAs: editingAlsoKnownAs.value,
            services: editingServices.value,
        }),
    })
        .then(({ rotationKey }) => {
            editing.value = false;
            exported.value = false;
            actor = {
                ...actor,
                rotationKey,
            };
            fetchActor();
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
function exportActor() {
    exporting.value = true;

    if (
        !confirm(
            "Be careful exporting! Anyone with the export file can take control of the actor.",
        )
    ) {
        exporting.value = false;
        return;
    }

    fetchFromAPI("/actors/export", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did: actor.did }),
    })
        .then((result) => {
            // Turn the result into a json file and download it
            const blob = new Blob([JSON.stringify(result)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${actor.did}.json`;
            a.click();
            URL.revokeObjectURL(url);
            exported.value = true;
        })
        .catch((error) => {
            alert(error);
        })
        .finally(() => {
            exporting.value = false;
        });
}

const removing = ref(false);
function removeActor() {
    removing.value = true;
    if (
        !confirm(
            "Removing an actor will just remove it from this system. Its properties will be restored on plc.directory and control of the actor can be restored by importing the export file.",
        )
    ) {
        removing.value = false;
        return;
    }

    fetchFromAPI("/actors/remove", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did: actor.did }),
    })
        .then(() => {
            // TODO: do something
        })
        .catch((error) => {
            alert(error);
        })
        .finally(() => {
            removing.value = false;
        });
}
</script>
