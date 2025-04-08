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
    <div v-if="editing">
        <form @submit.prevent="save()">
            <input type="text" ref="editor" v-model="editingValue" />
            <input type="submit" value="Save" :disabled="saving" />
            <button @click.prevent="editing = false" :disabled="saving">
                Cancel
            </button>
        </form>
    </div>
    <div v-else>
        {{ myChatName ?? "Unnamed Chat" }}
        <button @click="edit">Edit Name</button>
    </div>
</template>

<style scoped>
button,
input[type="submit"] {
    font-size: 1rem;
}

div {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    justify-content: center;
}

form {
    input[type="text"] {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
    }

    input[type="submit"] {
        border-radius: 0;
        background: var(--highlight);
    }

    button {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
    }
}
</style>
