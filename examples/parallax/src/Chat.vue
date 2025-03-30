<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import type {
    GraffitiObject,
    GraffitiSession,
    JSONSchema,
} from "@graffiti-garden/api";
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
type ChatNameObject = GraffitiObject<ReturnType<typeof chatNameSchema>>;

const { objects: chatNamesRaw, isInitialPolling: isInitialPollingChatNames } =
    useGraffitiDiscover(
        () => [props.channel],
        () => chatNameSchema(props.channel),
    );

const chatNames = computed<ChatNameObject[]>(() =>
    chatNamesRaw.value.toSorted(
        (a, b) => b.value.published - a.value.published,
    ),
);

const myChatName = computed(() => {
    const entry = chatNames.value
        .filter((c) => c.actor === graffitiSession.value?.actor)
        .at(0);
    return entry?.value.name;
});

const groupedChatNames = computed(() => {
    // Group adjacent chat names with the same name
    const grouped: ChatNameObject[][] = [];
    for (const chatName of chatNames.value) {
        const lastGroup = grouped.at(-1);
        if (lastGroup && lastGroup.at(-1)?.value.name === chatName.value.name) {
            lastGroup.push(chatName);
        } else {
            grouped.push([chatName]);
        }
    }
    return grouped;
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
            <li v-for="group in groupedChatNames" :key="group.at(0)?.url">
                <span
                    v-for="[index, chatName] in group.toReversed().entries()"
                    :key="chatName.url"
                >
                    {{
                        (chatName.actor === $graffitiSession.value?.actor
                            ? `${index ? "y" : "Y"}ou`
                            : chatName.actor) +
                        (group.length > 1 && index < group.length - 1
                            ? " and "
                            : "")
                    }}
                </span>
                named
                {{
                    group.some((c) => c.actor === $graffitiSession.value?.actor)
                        ? "your"
                        : "their"
                }}
                view of the chat "{{ group.at(0)?.value.name }}".
                <button
                    v-if="myChatName !== group.at(0)?.value.name"
                    @click="
                        saveChatName(
                            $graffitiSession.value,
                            group.at(0)?.value.name,
                        )
                    "
                    :disabled="saving"
                >
                    Use this name
                </button>
            </li>
        </ul>
    </template>
</template>
