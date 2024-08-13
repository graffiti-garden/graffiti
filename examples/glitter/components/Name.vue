<script setup lang="ts">
import { ref, toRef, computed, defineProps } from "vue";
import { useGraffiti } from "@graffiti-garden/client-vue";
import { useProfiles, putProfile } from "../activities/profiles";

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

const { results, poll, isPolling } = useProfiles(() => props.webId);

const editing = ref(false);

const currentProfile = computed(() => {
    if (!results.value.length) return null;
    return results.value.sort(
        (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
    )[0];
});

const currentName = computed(() => {
    return currentProfile.value ? currentProfile.value.value.name : "Anonymous";
});

const graffiti = useGraffiti();

const editingName = ref("");
const isSettingName = ref(false);
async function setName() {
    if (!editingName.value) return;

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
        );
    } else {
        await putProfile(editingName.value);
    }
    isSettingName.value = false;
    editing.value = false;
    poll();
}
</script>

<template>
    <span v-if="isPolling">Loading...</span>
    <template v-else>
        <template v-if="props.editable && webId === $graffitiSession.webId">
            <form v-if="editing" @submit.prevent="setName">
                <input
                    v-model="editingName"
                    v-click-away="setName"
                    @focus="$event.target.select()"
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
            </button>
        </template>
        <template v-else>
            <RouterLink :to="'/profile/' + encodeURIComponent(webId)">
                {{ currentName }}
            </RouterLink>
        </template>
    </template>
</template>
