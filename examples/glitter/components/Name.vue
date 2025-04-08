<script setup lang="ts">
import { ref, computed } from "vue";
import {
    useGraffitiDiscover,
    useGraffiti,
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

const { objects: results, isInitialPolling: isPolling } = useGraffitiDiscover(
    () => [props.actor],
    () => profileSchema(props.actor),
    sessionRef,
);
const currentProfile = computed(() => {
    if (!results.value.length) return null;
    return results.value.sort(
        (a, b) =>
            new Date(b.lastModified).getTime() -
            new Date(a.lastModified).getTime(),
    )[0];
});
const currentName = computed(() => {
    return currentProfile.value ? currentProfile.value.value.name : "Anonymous";
});

const editing = ref(false);
const editingName = ref("");
const isSettingName = ref(false);
async function setName() {
    if (!editingName.value) return;
    const session = sessionRef.value;
    if (!session) {
        alert("You are not logged in!");
        return;
    }

    isSettingName.value = true;
    if (currentProfile.value) {
        await graffiti.patch(
            {
                value: [
                    {
                        op: "replace",
                        path: "/name",
                        value: editingName.value,
                    },
                ],
            },
            currentProfile.value,
            session,
        );
    } else {
        await graffiti.put<ReturnType<typeof profileSchema>>(
            {
                value: {
                    name: editingName.value,
                    describes: props.actor,
                    published: Date.now(),
                },
                channels: [session.actor],
            },
            session,
        );
    }
    isSettingName.value = false;
    editing.value = false;
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
