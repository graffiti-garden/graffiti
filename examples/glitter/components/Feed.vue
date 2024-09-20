<script setup lang="ts">
import { computed } from "vue";
import { useDiscover, useGraffitiSession } from "@graffiti-garden/client-vue";
import { followSchema } from "./schemas";
import Notes from "./Notes.vue";

const sessionRef = useGraffitiSession();

const { results: follows, isPolling } = useDiscover(
    () => (sessionRef.value.webId ? [sessionRef.value.webId] : []),
    () => followSchema(sessionRef.value.webId ?? ""),
    sessionRef,
);

const webIds = computed(() => [
    ...new Set([...follows.value.map((f) => f.value.object)]),
]);
</script>

<template>
    <template v-if="isPolling">
        <h1>Loading...</h1>
    </template>
    <template v-else-if="!follows.length">
        <h1>You're not following anyone!</h1>
        <p>
            Browse the <RouterLink to="/directory">directory</RouterLink> for
            people to follow.
        </p>
    </template>
    <Notes v-else :webIds="webIds" prompt="what's on your mind?" />
</template>
