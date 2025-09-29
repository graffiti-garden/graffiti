<script setup lang="ts">
import { computed } from "vue";
import Name from "./Name.vue";
import Follow from "./Follow.vue";
import Notes from "./Notes.vue";

const props = defineProps<{
    actorEncoded: string;
}>();

const actor = computed(() =>
    props.actorEncoded ? decodeURIComponent(props.actorEncoded) : "",
);
</script>

<template>
    <h1>
        <Name :actor="actor" :editable="true" />
    </h1>
    <h2>
        <a :href="actor">{{ actor }}</a>
    </h2>
    <Follow v-if="actor !== $graffitiSession.value?.actor" :object="actor" />
    <Notes
        :actors="[actor]"
        :at="actor !== $graffitiSession.value?.actor ? [actor] : undefined"
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
