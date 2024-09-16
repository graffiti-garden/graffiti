<script setup lang="ts">
import { computed, inject, type Ref } from "vue";
import { type GraffitiSession } from "@graffiti-garden/client-vue";
import Name from "./Name.vue";
import Follow from "./Follow.vue";
// import Notes from "./Notes.vue";

const props = defineProps({
    webIdEncoded: {
        type: String,
        required: true,
    },
});

const session = inject<Ref<GraffitiSession>>("graffitiSession")!;

const webId = computed(() =>
    props.webIdEncoded ? decodeURIComponent(props.webIdEncoded) : "",
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
    <!-- <Notes
        :webIds="[webId]"
        :at="webId !== session.webId ? webId : undefined"
        :prompt="
            webId === session.webId
                ? 'what\'s on your mind?'
                : 'to my dear friend...'
        "
    /> -->
</template>
