<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import { ref, useTemplateRef, nextTick } from "vue";
import type { ChatNameSchema } from "./schemas";

const props = defineProps<{
    channel: string;
    myChatName: string | undefined;
    session: GraffitiSession;
}>();

const editing = ref(false);
const saving = ref(false);
const editingValue = ref("");
const editor = useTemplateRef("editor");

async function edit() {
    editing.value = true;
    editingValue.value = props.myChatName ?? "";
    await nextTick();
    editor.value?.focus();
    editor.value?.select();
}

const graffiti = useGraffiti();
async function save(name?: string) {
    name = name ?? editingValue.value;
    if (!name || name === props.myChatName) {
        editing.value = false;
        return;
    }
    saving.value = true;
    await graffiti.put<ChatNameSchema>(
        {
            channels: [props.channel],
            value: {
                describes: props.channel,
                name,
                published: Date.now(),
            },
        },
        props.session,
    );
    saving.value = false;
    editing.value = false;
}
</script>

<template>
    <span v-if="editing">
        <form @submit.prevent="save()">
            <input ref="editor" v-model="editingValue" />
            <input type="submit" value="Save" :disabled="saving" />
            <button @click.prevent="editing = false" :disabled="saving">
                Cancel
            </button>
        </form>
    </span>
    <span v-else>
        {{ myChatName ?? "Unnamed Chat" }}
        <button @click="edit">Edit</button>
    </span>
</template>
