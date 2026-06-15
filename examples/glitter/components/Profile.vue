<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import {
    useGraffitiActorToHandle,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import Name from "./Name.vue";
import Follow from "./Follow.vue";
import Notes from "./Notes.vue";
import { type FollowObject } from "./follows";
import { followSchema } from "./schemas";

const props = defineProps<{
    actorEncoded: string;
}>();

const actor = computed(() =>
    props.actorEncoded ? decodeURIComponent(props.actorEncoded) : "",
);
const session = useGraffitiSession();
const { handle } = useGraffitiActorToHandle(actor);
const nameComponent = useTemplateRef<{ hasProfile: boolean }>("nameComponent");
const hasName = computed(() => nameComponent.value?.hasProfile ?? false);
const { objects: followObjects, isFirstPoll: isPollingFollow } =
    useGraffitiDiscover(
        () => (session.value ? [session.value.actor] : []),
        () => followSchema(session.value?.actor ?? "", actor.value),
    );
const follows = computed(
    () => followObjects.value as unknown as FollowObject[],
);
</script>

<template>
    <h1>
        <Name ref="nameComponent" :actor="actor" :editable="true" />
    </h1>
    <h2 v-if="hasName && handle">{{ handle }}</h2>
    <Follow
        v-if="actor !== $graffitiSession.value?.actor"
        :object="actor"
        :follows="follows"
        :loading="isPollingFollow"
    />
    <Notes
        :actors="[actor]"
        :to="actor !== $graffitiSession.value?.actor ? [actor] : undefined"
        :prompt="
            actor === $graffitiSession.value?.actor
                ? 'what\'s on your mind?'
                : 'to my dear friend...'
        "
    />
</template>

<style scoped>
h1 {
    display: flex;
    align-items: center;
    justify-content: center;
}

h2 {
    text-align: center;
}
</style>
