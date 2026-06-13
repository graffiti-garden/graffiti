<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { GraffitiSession, JSONSchema } from "@graffiti-garden/api";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { addMember } from "./setters";
import ChatAdmin from "./ChatAdmin.vue";
import ChatName from "./ChatName.vue";
import { parallaxOrProvenance } from "./parallaxOrProvenance";

const props = defineProps<{
    session: GraffitiSession;
}>();

const { objects: chatsAll, isFirstPoll } = useGraffitiDiscover(
    () => [props.session.actor],
    () =>
        ({
            properties: {
                value: {
                    required: ["activity", "target", "object", "published"],
                    properties: {
                        activity: { enum: ["Add", "Remove"] },
                        target: { enum: [props.session.actor] },
                        object: { type: "string" },
                        published: { type: "number" },
                    },
                },
            },
        }) as const satisfies JSONSchema,
    () => props.session,
);

type MembershipUpdate = {
    value: {
        activity: "Add" | "Remove";
        object: string;
        published: number;
    };
};

const chats = computed(() => {
    const latestByChat = new Map<string, MembershipUpdate>();
    for (const update of chatsAll.value as MembershipUpdate[]) {
        const current = latestByChat.get(update.value.object);
        if (!current || current.value.published < update.value.published) {
            latestByChat.set(update.value.object, update);
        }
    }

    const chats: string[] = [];
    for (const update of latestByChat.values()) {
        if (update.value.activity === "Add") {
            chats.push(update.value.object);
        }
    }
    return chats;
});

const creating = ref(false);
const router = useRouter();
async function createChat(session: GraffitiSession) {
    creating.value = true;
    try {
        const channel = crypto.randomUUID();
        await addMember(session.actor, new Set(), channel, session);
        router.push({ name: "chat", params: { channel } });
    } finally {
        creating.value = false;
    }
}
</script>

<template>
    <header>
        <button @click="createChat(session)" :disabled="creating">
            {{ creating ? "Creating..." : "New Chat" }}
        </button>
        <h1>
            {{ parallaxOrProvenance }}
            Chat
        </h1>
        <button @click="$graffiti.logout(session)">Log out</button>
    </header>
    <main>
        <ul>
            <li v-if="isFirstPoll">Loading...</li>
            <li v-for="object in chats" :key="object">
                <RouterLink
                    :to="{
                        name: 'chat',
                        params: { channel: object },
                    }"
                >
                    <ChatName :session="session" :channel="object" />
                    <span v-if="parallaxOrProvenance === 'Provenance'">
                        (admin:
                        <ChatAdmin :channel="object" :session="session" />)
                    </span>
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
