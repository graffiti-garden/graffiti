<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from "vue";
import { addMember } from "./setters";
import type { GraffitiSession } from "@graffiti-garden/api";

const props = defineProps<{
    myMembers: Set<string>;
    channel: string;
    session: GraffitiSession;
}>();
const emit = defineEmits<{
    send: [message: string];
}>();

const message = ref("");
const joining = ref(false);

const input = useTemplateRef("messageInput");

onMounted(() => {
    input.value?.focus();
});

function sendMyMessage() {
    if (!message.value) return;
    const content = message.value;
    message.value = "";
    emit("send", content);
    nextTick(() => input.value?.focus());
}

async function joinChat() {
    joining.value = true;
    try {
        await addMember(
            props.session.actor,
            props.myMembers,
            props.channel,
            props.session,
        );
    } finally {
        joining.value = false;
    }
}
</script>

<template>
    <form v-if="myMembers.has(session.actor)" @submit.prevent="sendMyMessage">
        <input
            type="text"
            v-model="message"
            placeholder="Message"
            ref="messageInput"
        />
        <input type="submit" value="Send" class="visually-hidden" />
    </form>
    <form v-else @submit.prevent="joinChat">
        <input
            type="submit"
            :value="joining ? 'Joining...' : 'Join Chat'"
            :disabled="joining"
        />
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
