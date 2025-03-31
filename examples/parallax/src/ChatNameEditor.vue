<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { ref, useTemplateRef, nextTick } from "vue";
import { setChatName } from "./setters";

const props = defineProps<{
    channel: string;
    myChatName: string | undefined;
    session: GraffitiSession;
    myMembers: Set<string>;
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

async function save() {
    saving.value = true;
    await setChatName(
        editingValue.value,
        props.myChatName,
        props.myMembers,
        props.channel,
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
