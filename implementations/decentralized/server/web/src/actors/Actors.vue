<template>
    <p v-if="actors === undefined">Loading...</p>
    <template v-else-if="actors === null">
        <p>Error loading actors</p>
        <button @click="fetchActors">Retry</button>
    </template>
    <ul v-else>
        <li v-for="actor in actors" :key="actor.did">
            <article>
                <a :href="`https://plc.directory/${actor.did}`" target="_blank">
                    <h2>
                        {{ actor.did }}
                    </h2>
                </a>
            </article>
        </li>
    </ul>
    <button @click="createActor" :disabled="creating">
        {{ creating ? "Creating New Actor..." : "New Actor" }}
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromAPI } from "../globals";

interface Actor {
    did: string;
    createdAt: number;
    currentCid: string;
}

const actors = ref<Array<Actor> | undefined | null>(undefined);
function fetchActors() {
    actors.value = undefined;
    fetchFromAPI("/actors/list")
        .then((value: { actors: Array<Actor> }) => {
            actors.value = value.actors.sort(
                (a, b) => a.createdAt - b.createdAt,
            );
        })
        .catch((error) => {
            console.error(error);
            actors.value = null;
        });
}
fetchActors();

const creating = ref(false);
async function createActor() {
    creating.value = true;
    try {
        const result = await fetchFromAPI("/actors/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        const { did, currentCid, createdAt } = result;
        actors.value?.push({ did, currentCid, createdAt });
    } catch (error) {
        alert(error);
    } finally {
        creating.value = false;
    }
}
</script>
