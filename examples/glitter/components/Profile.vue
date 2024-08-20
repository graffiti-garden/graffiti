<script setup lang="ts">
import { computed } from "vue";
import Name from "./Name.vue";
import Follow from "./Follow.vue";
import Notes from "./Notes.vue";

const props = defineProps({
    webIdEncoded: {
        type: String,
    },
});

const webId = computed(() =>
    props.webIdEncoded ? decodeURIComponent(props.webIdEncoded) : undefined,
);
</script>

<template>
    <h1>
        <Name :webId="webId" :editable="true" />
    </h1>
    <h2>
        <a :href="webId">{{ webId }}</a>
    </h2>
    <p>
        <Follow :object="webId" />
    </p>
    <Notes
        :webIds="[webId]"
        :at="webId !== $graffitiSession.webId ? webId : undefined"
        :prompt="
            webId === $graffitiSession.webId
                ? 'what\'s on your mind?'
                : 'to my dear friend...'
        "
    />
</template>
