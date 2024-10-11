<script setup lang="ts">
import { ref } from "vue";
import {
    useGraffiti,
    useDiscover,
    useGraffitiSession,
} from "@graffiti-garden/client-vue";
import { followSchema } from "./schemas";

const sessionRef = useGraffitiSession();

const props = defineProps<{
    object: string;
}>();

const { results: follows, isPolling: isPollingFollows } = useDiscover(
    () => (sessionRef.value ? [sessionRef.value.webId] : []),
    () => followSchema(sessionRef.value?.webId ?? "", props.object),
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
            follows.value.map((follow) =>
                useGraffiti().delete(follow, session),
            ),
        );
    } else if (props.object) {
        await useGraffiti().put<ReturnType<typeof followSchema>>(
            {
                value: {
                    type: "Follow",
                    object: props.object,
                    actor: session.webId,
                },
                channels: [session.webId],
                webId: session.webId,
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
