<script setup lang="ts">
import { ref, inject, type Ref } from "vue";
import {
    useGraffiti,
    useDiscover,
    type GraffitiSession,
} from "@graffiti-garden/client-vue";

const sessionRef = inject<Ref<GraffitiSession>>("graffitiSession")!;

const props = defineProps({
    object: {
        type: String,
    },
});

const followSchema = () =>
    ({
        properties: {
            value: {
                properties: {
                    type: { enum: ["Follow"] },
                    object: {
                        type: "string",
                        ...(props.object ? { enum: [props.object] } : {}),
                    },
                    actor: { type: "string", enum: [sessionRef.value.webId] },
                },
                required: ["type", "object"],
            },
            webId: { type: "string", enum: [sessionRef.value.webId] },
        },
    }) as const;

const { results: follows, isPolling: isPollingFollows } = useDiscover(
    () => (sessionRef.value.webId ? [sessionRef.value.webId] : []),
    followSchema,
    () => sessionRef.value,
);

const isToggling = ref(false);
async function toggleFollow() {
    const session = sessionRef.value;
    if (!session.webId) {
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
