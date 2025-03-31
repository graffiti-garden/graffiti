<script setup lang="ts">
import { ref } from "vue";
import { sendMessage } from "./setters";
import type { GraffitiSession } from "@graffiti-garden/api";

const props = defineProps<{
    myMembers: Set<string>;
    channel: string;
    session: GraffitiSession;
}>();

const message = ref("");
const isSending = ref(false);

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
}
</script>

<template>
    <form @submit.prevent="sendMyMessage">
        <input
            type="text"
            v-model="message"
            placeholder="Message"
            :disabled="isSending"
        />
        <input type="submit" value="Send" />
    </form>
</template>
