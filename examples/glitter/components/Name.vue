<script setup lang="ts">
import { ref, computed, inject, type Ref } from "vue";
import {
    useDiscover,
    useGraffiti,
    type GraffitiSession,
} from "@graffiti-garden/client-vue";
import { profileSchema } from "./schemas";

const session = inject<Ref<GraffitiSession>>("graffitiSession")!;

const props = defineProps({
    webId: {
        type: String,
        required: true,
    },
    editable: {
        type: Boolean,
        default: false,
    },
});

const { results, isPolling } = useDiscover(
    () => [props.webId],
    profileSchema(() => props.webId),
    session,
);
const currentProfile = computed(() => {
    if (!results.value.length) return null;
    return results.value.sort(
        (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
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
    if (!session.value.webId) {
        alert("You are not logged in!");
        return;
    }

    isSettingName.value = true;
    if (currentProfile.value) {
        await useGraffiti().patch(
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
            session.value,
        );
    } else {
        await useGraffiti().put<ReturnType<typeof profileSchema>>(
            {
                value: {
                    type: "Profile",
                    name: editingName.value,
                    describes: props.webId,
                },
                channels: [session.value.webId],
            },
            session.value,
        );
    }
    isSettingName.value = false;
    editing.value = false;
}
</script>

<template>
    <span v-if="isPolling">Loading...</span>
    <template v-else>
        <template v-if="props.editable && webId === session.webId">
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
            <RouterLink :to="'/profile/' + encodeURIComponent(webId ?? '')">
                {{ currentName }}
            </RouterLink>
        </template>
    </template>
</template>
