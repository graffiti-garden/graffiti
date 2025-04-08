<script setup lang="ts">
import { computed } from "vue";
import {
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { followSchema } from "./schemas";
import Notes from "./Notes.vue";

const sessionRef = useGraffitiSession();

const { objects: follows, isInitialPolling } = useGraffitiDiscover(
    () => (sessionRef.value ? [sessionRef.value.actor] : []),
    () => followSchema(sessionRef.value?.actor ?? ""),
    sessionRef,
);

const actors = computed(() => [
    ...new Set([...follows.value.map<string>((f) => f.value.object)]),
]);
</script>

<template>
    <template v-if="isInitialPolling">
        <h1>Loading...</h1>
    </template>
    <template v-else-if="!follows.length">
        <h1>You're not following anyone!</h1>
        <p>
            Browse the <RouterLink to="/directory">directory</RouterLink> for
            people to follow.
        </p>
    </template>
    <Notes v-else :actors="actors" prompt="what's on your mind?" />
</template>
