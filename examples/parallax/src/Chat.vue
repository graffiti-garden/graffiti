<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import {
    useGraffiti,
    useGraffitiSession,
    useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import {
    chatNameSchema,
    memberUpdateSchema,
    type ChatNameObject,
    type MemberUpdateObject,
} from "./schemas";
import { sortByPublished } from "./utils";
import Membership from "./Membership.vue";
import ChatNameEditor from "./ChatNameEditor.vue";

const props = defineProps<{
    channel: string;
}>();

const graffitiSession = useGraffitiSession();

const { objects: chatNamesRaw, isInitialPolling: isInitialPollingChatNames } =
    useGraffitiDiscover(
        () => [props.channel],
        () => chatNameSchema(props.channel),
    );
const chatNames = sortByPublished<ChatNameObject>(chatNamesRaw);

const myChatName = computed(() => {
    const entry = chatNames.value
        .filter((c) => c.actor === graffitiSession.value?.actor)
        .at(0);
    return entry?.value.name;
});

const {
    objects: memberUpdatesRaw,
    isInitialPolling: isInitialPollingMemberUpdates,
} = useGraffitiDiscover(
    () => [props.channel],
    () => memberUpdateSchema(props.channel),
);
const memberUpdates = sortByPublished<MemberUpdateObject>(memberUpdatesRaw);

const myMembers = computed(() => {
    const members = new Set<string>();
    for (const memberUpdate of memberUpdates.value.toReversed()) {
        if (memberUpdate.value.activity === "Add") {
            members.add(memberUpdate.value.target);
        } else {
            members.delete(memberUpdate.value.target);
        }
    }
    return members;
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
</script>

<template>
    <template v-if="!$graffitiSession.value">
        <p>You are not logged in!</p>
    </template>
    <template v-else>
        <article>
            <h2>
                <ChatNameEditor
                    :channel="props.channel"
                    :myChatName="myChatName"
                    :session="$graffitiSession.value"
                />
            </h2>
            <ul>
                <li v-for="group in groupedChatNames" :key="group.at(0)?.url">
                    <span
                        v-for="[index, chatName] in group
                            .toReversed()
                            .entries()"
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
                        group.some(
                            (c) => c.actor === $graffitiSession.value?.actor,
                        )
                            ? "your"
                            : "their"
                    }}
                    view of the chat "{{ group.at(0)?.value.name }}".
                    <button v-if="myChatName !== group.at(0)?.value.name">
                        Use this name
                    </button>
                </li>
            </ul>
        </article>

        <aside>
            <h3>Members</h3>
            <Membership
                :channel="props.channel"
                :myMembers="myMembers"
                :session="$graffitiSession.value"
            />
        </aside>
    </template>
</template>

<style>
body {
    font-family: sans-serif;
    margin: 0;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

header,
footer {
    background-color: #222;
    color: white;
    padding: 1em;
    text-align: center;
}

main {
    display: flex;
    flex: 1;
    padding: 1em;
    gap: 1em;
}

section {
    flex: 3;
}

aside {
    flex: 1;
    background-color: #f3f3f3;
    padding: 1em;
    border-left: 1px solid #ccc;
}

h1,
h2,
h3 {
    margin-top: 0;
}

ul {
    list-style: none;
    padding: 0;
}

li {
    margin-bottom: 0.5em;
}

article {
    margin-top: 1em;
}

footer {
    font-size: 0.9em;
}
</style>

<!-- @click="
    saveChatName(
        $graffitiSession.value,
        group.at(0)?.value.name,
    )
"
:disabled="saving" -->
