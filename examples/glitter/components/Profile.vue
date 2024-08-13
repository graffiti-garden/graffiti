<script setup lang="ts">
import { ref, computed, defineProps } from "vue";
import Name from "./Name.vue";
import Follow from "./Follow.vue";
import Notes from "./Notes.vue";

const props = defineProps({
    webIdEncoded: {
        type: String,
    },
});

const webId = computed(() => decodeURIComponent(props.webIdEncoded));
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
        :at="webId !== $graffitiSession.webId ? webId : null"
        :prompt="
            webId === $graffitiSession.webId
                ? 'what\'s on your mind?'
                : 'to my dear friend...'
        "
    />
</template>
