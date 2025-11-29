<template>
    <p v-if="actors === undefined">Loading...</p>
    <ul v-else>
        <li v-for="actor in actors" :key="actor.actor">
            {{ actor.actor }}
        </li>
    </ul>
    <form @submit.prevent="addActor">
        <input type="text" v-model="newActor" placeholder="New actor" />
        <output></output>
        <button type="submit">Add</button>
    </form>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromAPI, isLoggedIn } from "./globals";

const actors = ref<
    | Array<{
          actor: string;
          createdAt: number;
      }>
    | undefined
>(undefined);

const newActor = ref("");
const addingActor = ref(false);
async function addActor() {
    addingActor.value = true;
    try {
        await fetchFromAPI("/actors/add", {
            method: "POST",
            body: JSON.stringify({ actor: newActor.value }),
        });
    } catch (error: any) {
        alert(`Failed to add actor. ${error.message}`);
        addingActor.value = true;
        return;
    }
    addingActor.value = false;
}

function fetchActors() {
    fetchFromAPI("/actors/list")
        .then(
            (value: {
                actors: Array<{
                    actor: string;
                    createdAt: number;
                }>;
            }) => {
                actors.value = value.actors.sort(
                    (a, b) => a.createdAt - b.createdAt,
                );
            },
        )
        .catch(() => {
            // If we're still logged in, try again
            if (isLoggedIn.value) {
                setTimeout(() => {
                    fetchActors();
                }, 2000);
            }
        });
}
fetchActors();
</script>
