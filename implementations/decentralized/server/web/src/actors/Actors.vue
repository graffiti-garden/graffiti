<template>
    <header>
        <h2>Actor</h2>
    </header>
    <p>
        Your actor is a
        <a href="https://www.w3.org/TR/did-1.0/">decentralized identifier</a>
        that represents you even if you change your handle.
    </p>
    <p v-if="actors === undefined"><em>Loading...</em></p>
    <template v-else-if="actors === null">
        <p><em>Error loading actor!</em></p>
        <button @click="fetchActors">Retry</button>
    </template>
    <template v-else-if="actors.length === 0">
        <p><em>You have no actor.</em></p>
        <RouterLink :to="{ name: 'replace-actor' }" role="button">Choose actor</RouterLink>
    </template>
    <ul v-else class="cards">
        <li>
            <DisplayActor :actor="actors[0]" />
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromSelf } from "../globals";
import type { Actor } from "./types";
import DisplayActor from "./DisplayActor.vue";

const emit = defineEmits(["loaded"]);
const actors = ref<Array<Actor> | undefined | null>(undefined);
function fetchActors() {
    actors.value = undefined;
    fetchFromSelf("/app/actors/list")
        .then((value: { actors: Array<Actor> }) => {
            actors.value = value.actors;
        })
        .catch((error) => {
            console.error(error);
            actors.value = null;
        })
        .finally(() => emit("loaded"));
}
fetchActors();
</script>
