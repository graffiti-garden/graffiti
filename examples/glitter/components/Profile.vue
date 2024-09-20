<script setup lang="ts">
import { computed } from "vue";
import { GraffitiIdentityProviderLogin } from "@graffiti-garden/client-vue";
import Name from "./Name.vue";
import Follow from "./Follow.vue";
import Notes from "./Notes.vue";

const props = defineProps<{
    webIdEncoded: string;
}>();

const webId = computed(() =>
    props.webIdEncoded ? decodeURIComponent(props.webIdEncoded) : "",
);
</script>

<template>
    <h1>
        <Name :webId="webId" :editable="true" />
    </h1>
    <h2 v-if="webId !== $graffitiSession.value.webId">
        <a :href="webId">{{ webId }}</a>
    </h2>
    <GraffitiIdentityProviderLogin v-else client-name="namebook" />
    <p>
        <Follow :object="webId" />
    </p>
    <Notes
        :webIds="[webId]"
        :at="webId !== $graffitiSession.value.webId ? webId : undefined"
        :prompt="
            webId === $graffitiSession.value.webId
                ? 'what\'s on your mind?'
                : 'to my dear friend...'
        "
    />
</template>
