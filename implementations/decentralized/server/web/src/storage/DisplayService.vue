<template>
    <article>
        <h2>
            <form v-if="renameOpen" @submit.prevent="renameService">
                <input
                    type="text"
                    v-focus
                    v-model="renameName"
                    @focus="
                        $nextTick().then(() =>
                            ($event.target as HTMLInputElement).select(),
                        )
                    "
                />
                <button type="submit">Save</button>
                <button @click="renameOpen = false">Cancel</button>
            </form>
            <span v-else>
                {{ service.name }}
                <button
                    @click="
                        renameOpen = true;
                        renameName = service.name;
                    "
                >
                    Rename
                </button>
            </span>
        </h2>
        <h3>
            <code>
                {{ `gf:s:https://example.com/s/${service.serviceId}` }}
            </code>
            <button>Copy URL</button>
        </h3>
        <button @click="deleteService" :disabled="deleting">
            {{ deleting ? "Deleting..." : "Delete" }}
        </button>
        <button>Download Data</button>
    </article>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromSelf } from "../globals";
import type { Service } from "./types";

const props = defineProps<{
    service: Service;
    onDelete: () => void;
}>();
const service = props.service;

const deleting = ref(false);
function deleteService() {
    deleting.value = true;

    if (
        !confirm(
            "Are you sure you want to delete this service? It CANNOT be undone.",
        )
    ) {
        deleting.value = false;
        return;
    }

    fetchFromSelf(`/app/service-instances/service/${service.serviceId}`, {
        method: "DELETE",
    })
        .then(() => {
            props.onDelete();
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            deleting.value = false;
        });
}

const renameOpen = ref(false);
const renameName = ref("");
const renaming = ref(false);
function renameService() {
    renaming.value = true;

    const name = renameName.value;

    fetchFromSelf(`/app/service-instances/service/${service.serviceId}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then(() => {
            service.name = name;
            renameOpen.value = false;
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            renaming.value = false;
        });
}
</script>
