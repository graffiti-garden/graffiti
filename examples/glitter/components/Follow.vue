<script setup lang="ts">
import { ref, toRef } from "vue";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/client-vue";
import { useFollows, putFollow } from "../activities/follows";

const props = defineProps({
    object: {
        type: String,
        required: true,
    },
});

const session = useGraffitiSession();
const graffiti = useGraffiti();

const { results: follows, isPolling: isPollingFollows } = useFollows(
    () => session.webId,
    () => props.object,
);

const isToggling = ref(false);
async function toggleFollow() {
    isToggling.value = true;
    if (follows.value.length) {
        await Promise.all(
            follows.value.map((follow) => graffiti.delete(follow)),
        );
    } else {
        await putFollow(props.object);
    }
    isToggling.value = false;
}
</script>

<template>
    <input
        type="checkbox"
        :id="'follow:' + object"
        :checked="!follows.length"
    />
    <label :for="'follow:' + object" v-if="isPollingFollows || isToggling"
        >loading...</label
    >
    <label v-else :for="'follow' + object" @click.prevent="toggleFollow">
        follow<template v-if="follows.length">ed</template>
    </label>
</template>
