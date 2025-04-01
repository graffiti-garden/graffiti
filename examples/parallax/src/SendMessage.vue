<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from "vue";
import { sendMessage } from "./setters";
import type { GraffitiSession } from "@graffiti-garden/api";

const props = defineProps<{
    myMembers: Set<string>;
    channel: string;
    session: GraffitiSession;
}>();

const message = ref("");
const isSending = ref(false);

const input = useTemplateRef("messageInput");

onMounted(() => {
    input.value?.focus();
});

async function sendMyMessage() {
    if (!message.value) return;
    isSending.value = true;
    await sendMessage(
        message.value,
        props.myMembers,
        props.channel,
        props.session,
    );
    message.value = "";
    isSending.value = false;
    await nextTick();
    input.value?.focus();
}
</script>

<template>
    <form @submit.prevent="sendMyMessage">
        <input
            type="text"
            v-model="message"
            placeholder="Message"
            :disabled="isSending"
            ref="messageInput"
        />
        <input type="submit" value="Send" class="visually-hidden" />
    </form>
</template>

<style>
form {
    display: flex;

    input[type="text"] {
        flex: 1;
        background: var(--foreground2);
        color: var(--text1);
        border: none;
        padding-left: 1rem;
        padding-right: 1rem;
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
        border-radius: 1rem;
    }

    input[type="text"]::placeholder {
        color: var(--text4);
    }

    input[type="text"]:focus {
        outline: none;
    }
}
</style>
