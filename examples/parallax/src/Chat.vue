<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import type { GraffitiSession, JSONSchema } from "@graffiti-garden/api";
import {
    useGraffiti,
    useGraffitiSession,
    useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

const props = defineProps<{
    channel: string;
}>();

const graffiti = useGraffiti();
const graffitiSession = useGraffitiSession();

function chatNameSchema(channel: string) {
    return {
        properties: {
            value: {
                required: ["describes", "name", "published"],
                properties: {
                    describes: { enum: [channel] },
                    name: { type: "string" },
                    published: { type: "number" },
                },
            },
        },
    } as const satisfies JSONSchema;
}

const { objects: chatNamesRaw, isInitialPolling: isInitialPollingChatNames } =
    useGraffitiDiscover(
        () => [props.channel],
        () => chatNameSchema(props.channel),
    );

const chatNames = computed(() =>
    chatNamesRaw.value.toSorted(
        (a, b) => b.value.published - a.value.published,
    ),
);

// The one to display is the most recent one by the actor
const myChatName = computed(() => {
    const entry = chatNames.value
        .filter((c) => c.actor === graffitiSession.value?.actor)
        .at(0);
    return entry?.value.name;
});

const editingChatName = ref(false);
const editingChatNameValue = ref("");
const editor = useTemplateRef("editor");
async function editChatName() {
    editingChatName.value = true;
    editingChatNameValue.value = myChatName.value ?? "";
    await nextTick();
    editor.value?.focus();
    editor.value?.select();
}
const saving = ref(false);
async function saveChatName(session: GraffitiSession, name?: string) {
    name = name ?? editingChatNameValue.value;
    if (!name || name === myChatName.value) {
        editingChatName.value = false;
        return;
    }
    saving.value = true;
    await graffiti.put<ReturnType<typeof chatNameSchema>>(
        {
            channels: [props.channel],
            value: {
                describes: props.channel,
                name,
                published: Date.now(),
            },
        },
        session,
    );
    saving.value = false;
    editingChatName.value = false;
}
</script>

<template>
    <template v-if="!$graffitiSession.value">
        <p>You are not logged in!</p>
    </template>
    <template v-else>
        <h2 v-if="editingChatName">
            <form @submit.prevent="saveChatName($graffitiSession.value)">
                <input ref="editor" v-model="editingChatNameValue" />
                <input type="submit" value="Save" :disabled="saving" />
                <button
                    @click.prevent="editingChatName = false"
                    :disabled="saving"
                >
                    Cancel
                </button>
            </form>
        </h2>
        <h2 v-else>
            {{ myChatName ?? "Unnamed Chat" }}
            <button @click="editChatName">Edit</button>
        </h2>
        <ul>
            <li v-for="chatName in chatNames" :key="chatName.url">
                <template
                    v-if="chatName.actor === $graffitiSession.value?.actor"
                >
                    You named your
                </template>
                <template v-else> {{ chatName.actor }} named their </template>
                view of the chat "{{ chatName.value.name }}"
                <button
                    v-if="myChatName !== chatName.value.name"
                    @click="
                        saveChatName(
                            $graffitiSession.value,
                            chatName.value.name,
                        )
                    "
                    :disabled="saving"
                >
                    Use this name
                </button>
            </li>
        </ul>
    </template>
    <!-- // Group ones with the same name -->
</template>
