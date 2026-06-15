<script setup lang="ts">
import { ref, computed } from "vue";
import {
    useGraffitiDiscover,
    useGraffiti,
    useGraffitiActorToHandle,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { profileSchema } from "./schemas";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();

const props = withDefaults(
    defineProps<{
        actor: string;
        editable?: boolean;
    }>(),
    {
        editable: false,
    },
);

const { objects: results, isFirstPoll: isPolling } = useGraffitiDiscover(
    () => [props.actor],
    () => profileSchema(props.actor),
);
const { handle } = useGraffitiActorToHandle(() => props.actor);

const currentProfile = computed(() => {
    return results.value.reduce<(typeof results.value)[number] | null>(
        (latest, profile) =>
            !latest || profile.value.published > latest.value.published
                ? profile
                : latest,
        null,
    );
});
const currentName = computed(() => {
    return currentProfile.value?.value.name ?? handle.value ?? props.actor;
});
const hasProfile = computed(() => currentProfile.value !== null);
defineExpose({ hasProfile });

const editing = ref(false);
const editingName = ref("");
const isSettingName = ref(false);
async function setName() {
    const name = editingName.value.trim();
    if (!name || isSettingName.value) return;

    const session = sessionRef.value;
    if (!session) {
        alert("You are not logged in!");
        return;
    }
    if (name === currentName.value) {
        editing.value = false;
        return;
    }

    isSettingName.value = true;
    try {
        await graffiti.post<ReturnType<typeof profileSchema>>(
            {
                value: {
                    name,
                    describes: session.actor,
                    published: Date.now(),
                },
                channels: [session.actor],
            },
            session,
        );
        editing.value = false;
    } finally {
        isSettingName.value = false;
    }
}
</script>

<template>
    <span v-if="!currentProfile && isPolling">Loading...</span>
    <template v-else>
        <template v-if="props.editable && actor === sessionRef?.actor">
            <form v-if="editing" @submit.prevent="setName">
                <input
                    v-model="editingName"
                    v-click-away="setName"
                    @focus="($event.target as HTMLInputElement).select()"
                    :disabled="isSettingName"
                    v-focus
                />
            </form>
            <button
                v-else
                @click="
                    editing = true;
                    editingName = currentName;
                "
            >
                {{ currentName }}
                ✏️
            </button>
        </template>
        <template v-else>
            <RouterLink :to="'/profile/' + encodeURIComponent(actor ?? '')">
                {{ currentName }}
            </RouterLink>
        </template>
    </template>
</template>
