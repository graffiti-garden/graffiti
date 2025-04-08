<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import type { GraffitiSession, JSONSchema } from "@graffiti-garden/api";
import { useGraffitiDiscover, useGraffiti } from "@graffiti-garden/wrapper-vue";
import { addMember } from "./setters";
import ChatName from "./ChatName.vue";

const props = defineProps<{
    session: GraffitiSession;
}>();

const { objects: chatsAll, isInitialPolling } = useGraffitiDiscover(
    () => [props.session.actor],
    () =>
        ({
            properties: {
                value: {
                    required: ["activity", "target", "object", "published"],
                    properties: {
                        activity: { enum: ["Add"] },
                        target: { enum: [props.session.actor] },
                        object: { type: "string" },
                        published: { type: "number" },
                    },
                },
            },
        }) as const satisfies JSONSchema,
);

// Group the chats by target
const groupedChats = () => {
    const groupedChats = new Map<string, typeof chatsAll.value>();
    for (const chat of chatsAll.value) {
        const object = chat.value.object;
        if (!groupedChats.has(object)) {
            groupedChats.set(object, []);
        }
        groupedChats.get(object)?.push(chat);
    }
    return groupedChats;
};

const creating = ref(false);
const router = useRouter();
async function createChat(session: GraffitiSession) {
    creating.value = true;
    const channel = crypto.randomUUID();
    await addMember(session.actor, new Set(), channel, session);
    creating.value = false;
    router.push({ name: "chat", params: { channel } });
}
</script>

<template>
    <header>
        <button @click="createChat(session)" :disabled="creating">
            {{ creating ? "Creating..." : "New Chat" }}
        </button>
        <h1>Parallax Chat</h1>
        <button @click="$graffiti.logout(session)">Log out</button>
    </header>
    <main>
        <ul>
            <li v-if="isInitialPolling">Loading...</li>
            <li v-for="[object] in groupedChats()" :key="object">
                <RouterLink
                    :to="{
                        name: 'chat',
                        params: { channel: object },
                    }"
                >
                    <ChatName :session="session" :channel="object" />
                </RouterLink>
            </li>
        </ul>
    </main>
</template>

<style scoped>
header {
    background: var(--background1);
}
ul {
    background: var(--background1);
}

li {
    display: contents;
}

li:has(+ li) a {
    border-bottom: 1px solid var(--foreground1);
}

li a {
    display: block;
    text-decoration: none;
    color: inherit;
    padding: 1rem;
}

a:hover {
    text-decoration: underline;
    background: var(--foreground2);
}
</style>
