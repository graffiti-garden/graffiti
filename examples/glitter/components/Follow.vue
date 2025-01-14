<script setup lang="ts">
import { ref } from "vue";
import {
    useGraffiti,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { followSchema } from "./schemas";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();

const props = defineProps<{
    object: string;
}>();

const { results: follows, isPolling: isPollingFollows } = useGraffitiDiscover(
    () => (sessionRef.value ? [sessionRef.value.actor] : []),
    () => followSchema(sessionRef.value?.actor ?? "", props.object),
    sessionRef,
);

const isToggling = ref(false);
async function toggleFollow() {
    const session = sessionRef.value;
    if (!session) {
        alert("You are not logged in!");
        return;
    }
    isToggling.value = true;
    if (follows.value.length) {
        await Promise.all(
            follows.value.map((follow) => graffiti.delete(follow, session)),
        );
    } else if (props.object) {
        await graffiti.put<ReturnType<typeof followSchema>>(
            {
                value: {
                    type: "Follow",
                    object: props.object,
                    actor: session.actor,
                },
                channels: [session.actor],
                actor: session.actor,
            },
            session,
        );
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
