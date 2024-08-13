<script setup lang="ts">
import { computed, toRef } from "vue";
import { useGraffitiSession } from "@graffiti-garden/client-vue";
import { useFollows } from "../activities/follows";
import Notes from "./Notes.vue";

const session = useGraffitiSession();
const { results: follows } = useFollows(() => session.webId);

const webIds = computed(() => [
    ...new Set([...follows.value.map((f) => f.value.object)]),
]);
</script>

<template>
    <template v-if="!follows.length">
        <h1>You're not following anyone!</h1>
        <p>
            Browse the <RouterLink to="/directory">directory</RouterLink> for
            people to follow.
        </p>
    </template>
    <Notes v-else :webIds="webIds" prompt="what's on your mind?" />
</template>
