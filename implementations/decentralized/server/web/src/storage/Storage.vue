<template>
    <p>
        Storage instances are where you store an actor's data. Each actor should
        have one storage instance. They serve as verification and a backup. If
        you are unhappy migrate your data somewhere else.
    </p>
    <h2>Your Storage Instances</h2>
    <ul v-if="instances && instances.length > 0">
        <li v-for="instance in instances" :key="instance.id">
            <article>
                <h2>
                    <form
                        v-if="renameId === instance.id"
                        @submit.prevent="renameInstance()"
                    >
                        <input
                            type="text"
                            v-focus
                            v-model="renameName"
                            @focus="
                                $nextTick().then(() =>
                                    (
                                        $event.target as HTMLInputElement
                                    ).select(),
                                )
                            "
                        />
                        <button type="submit">Save</button>
                        <button @click="renameId = null">Cancel</button>
                    </form>
                    <span v-else>
                        {{ instance.name }}
                        <button
                            @click="
                                renameId = instance.id;
                                renameName = instance.name;
                            "
                        >
                            Rename
                        </button>
                    </span>
                </h2>
                <h3>
                    {{ `graffiti:storage:wss:example.com/${instance.id}` }}
                    <button>Copy URL</button>
                </h3>
                <button
                    @click="deleteInstance(instance.id)"
                    :disabled="deleting === instance.id"
                >
                    {{ deleting === instance.id ? "Deleting..." : "Delete" }}
                </button>
                <button>Download Data</button>
            </article>
        </li>
    </ul>
    <p v-else>No instances found.</p>

    <button v-if="!createOpen" @click="createOpen = true">
        Create New Instance
    </button>
    <form v-else @submit.prevent="createInstance">
        <label for="newInstance"
            >Choose a name for your new storage instance:</label
        >
        <input
            v-focus
            type="text"
            id="newinstance"
            v-model="newInstance"
            placeholder="My Storage Instance"
            required
            :disabled="creating"
        />
        <button type="submit" :disabled="creating">
            {{ creating ? "Creating..." : "Create" }}
        </button>
    </form>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromAPI } from "../globals";

const instances = ref<
    | Array<{
          id: string;
          name: string;
          createdAt: number;
      }>
    | undefined
>(undefined);

const createOpen = ref(false);

const newInstance = ref("");
const creating = ref(false);
function createInstance() {
    const name = newInstance.value;
    if (!name) return;
    creating.value = true;
    fetchFromAPI("/storage-instances/create?name=" + name, {
        method: "POST",
    })
        .then(({ id, createdAt }) => {
            instances.value = [
                ...(instances.value ?? []),
                { id, name, createdAt },
            ];
            newInstance.value = "";
            createOpen.value = false;
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            creating.value = false;
        });
}

const deleting = ref<false | string>(false);
function deleteInstance(id: string) {
    deleting.value = id;

    if (
        !confirm(
            "Are you sure you want to delete this storage instance? It CANNOT be undone.",
        )
    ) {
        deleting.value = false;
        return;
    }

    fetchFromAPI("/storage-instances/delete?id=" + id, {
        method: "DELETE",
    })
        .then(() => {
            instances.value = instances.value?.filter(
                (instance) => instance.id !== id,
            );
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            deleting.value = false;
        });
}

const renameId = ref<string | null>(null);
const renameName = ref("");
const renaming = ref(false);
function renameInstance() {
    renaming.value = true;

    fetchFromAPI(
        "/storage-instances/rename?id=" +
            renameId.value +
            "&name=" +
            renameName.value,
        {
            method: "PUT",
        },
    )
        .then(() => {
            instances.value = instances.value?.map((instance) =>
                instance.id === renameId.value
                    ? { ...instance, name: renameName.value }
                    : instance,
            );
            renameId.value = null;
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            renaming.value = false;
        });
}

function fetchinstances() {
    fetchFromAPI("/storage-instances/list").then(
        (
            value: Array<{
                id: string;
                name: string;
                createdAt: number;
            }>,
        ) => {
            instances.value = value.sort((a, b) => a.createdAt - b.createdAt);
        },
    );
}
fetchinstances();
</script>
