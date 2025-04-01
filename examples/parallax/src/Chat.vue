<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, type Ref } from "vue";
import {
    useGraffitiSession,
    useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import {
    chatNameSchema,
    memberUpdateSchema,
    messageSchema,
    type ChatNameObject,
    type MemberUpdateObject,
    type MessageObject,
} from "./schemas";
import { sortByPublished, groupAdjacentBy } from "./utils";
import Membership from "./Membership.vue";
import ChatNameEditor from "./ChatNameEditor.vue";
import GroupNames from "./GroupNames.vue";
import { setChatName } from "./setters";
import SendMessage from "./SendMessage.vue";
import DisplayMessage from "./DisplayMessage.vue";

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
    for (const memberUpdate of memberUpdates.value
        .filter((m) => m.actor === graffitiSession.value?.actor)
        .toReversed()) {
        if (memberUpdate.value.activity === "Add") {
            members.add(memberUpdate.value.target);
        } else {
            members.delete(memberUpdate.value.target);
        }
    }
    return members;
});

const { objects: messages_, isInitialPolling: isInitialPollingMessages } =
    useGraffitiDiscover(
        () => [props.channel],
        () => messageSchema(),
    );
// Help the type system understand that messages_ is a Ref
const messages: Ref<MessageObject[]> = messages_;

// Group changes to the same name
const groupedChatNames = groupAdjacentBy(chatNames, (group, chatName) =>
    group.some((c) => c.value.name === chatName.value.name),
);

// Group changes performing the same operation to the same person
const groupedMemberUpdates = groupAdjacentBy(
    memberUpdates,
    (group, memberUpdate) =>
        group.some(
            (m) =>
                m.value.target === memberUpdate.value.target &&
                m.value.activity === memberUpdate.value.activity,
        ),
);

function publishedTime(
    object: ChatNameObject[] | MemberUpdateObject[] | MessageObject,
) {
    if (Array.isArray(object)) {
        return Math.min(...object.map((c) => c.value.published));
    } else {
        return object.value.published;
    }
}

// Merge the groups
const updates = computed(() => {
    return [
        ...groupedChatNames.value.map(
            (value) => ({ type: "ChatName", value }) as const,
        ),
        ...groupedMemberUpdates.value.map(
            (value) => ({ type: "MemberUpdate", value }) as const,
        ),
        ...messages.value.map((value) => ({ type: "Message", value }) as const),
    ].sort((a, b) => publishedTime(b.value) - publishedTime(a.value));
});
</script>

<template>
    <template v-if="!$graffitiSession.value">
        <p>You are not logged in!</p>
    </template>
    <template v-else>
        <article class="chat">
            <header>
                <h2>
                    <ChatNameEditor
                        :channel="props.channel"
                        :myChatName="myChatName"
                        :session="$graffitiSession.value"
                        :myMembers="myMembers"
                    />
                </h2>
            </header>
            <main>
                <ul>
                    <li
                        v-for="update in updates"
                        :key="
                            update.type === 'Message'
                                ? update.value.url
                                : update.value[0].url
                        "
                    >
                        <DisplayMessage
                            v-if="update.type === 'Message'"
                            :message="update.value"
                        />
                        <template v-else>
                            <GroupNames :group="update.value" />
                            <template v-if="update.type === 'ChatName'">
                                named
                                {{
                                    update.value.some(
                                        (c) =>
                                            c.actor ===
                                            $graffitiSession.value?.actor,
                                    )
                                        ? "your"
                                        : "their"
                                }}
                                {{ update.value.length > 1 ? "views" : "view" }}
                                of the chat "{{
                                    update.value.at(0)?.value.name
                                }}".
                                <button
                                    v-if="
                                        myChatName !==
                                        update.value.at(0)?.value.name
                                    "
                                    @click="
                                        setChatName(
                                            update.value[0].value.name,
                                            myChatName,
                                            myMembers,
                                            channel,
                                            $graffitiSession.value,
                                        )
                                    "
                                >
                                    Use this name
                                </button>
                            </template>
                            <span v-else>
                                {{
                                    update.value.at(0)?.value.activity === "Add"
                                        ? "added"
                                        : "removed"
                                }}
                                {{
                                    update.value.at(0)?.value.target ===
                                    $graffitiSession.value?.actor
                                        ? "you"
                                        : update.value.at(0)?.value.target
                                }}
                                {{
                                    update.value.at(0)?.value.activity === "Add"
                                        ? "to"
                                        : "from"
                                }}
                                {{
                                    update.value.some(
                                        (c) =>
                                            c.actor ===
                                            $graffitiSession.value?.actor,
                                    )
                                        ? "your"
                                        : "their"
                                }}
                                {{ update.value.length > 1 ? "views" : "view" }}
                                of the chat.
                                <!-- <button
                                v-if="
                                    myMembers.has(message.value.at(0)?.value.target)
                                "
                                @click="
                                    $graffiti.put(
                                        {
                                            channels: [props.channel],
                                            value: {
                                                activity: 'Remove',
                                                target: message.value.at(0)?.value
                                                    .target,
                                            },
                                        },
                                        $graffitiSession.value,
                                    )
                                "
                            >
                                Remove {{ message.value.at(0)?.value.target }}
                            </button> -->
                            </span>
                        </template>
                    </li>
                </ul>
            </main>

            <footer>
                <SendMessage
                    :channel="channel"
                    :myMembers="myMembers"
                    :session="$graffitiSession.value"
                />
            </footer>
        </article>
        <!--
        <aside>
            <h3>Members</h3>
            <Membership
                :channel="props.channel"
                :myMembers="myMembers"
                :session="$graffitiSession.value"
            />
        </aside> -->
    </template>
</template>

<style>
.chat {
    background: var(--background1);
    display: flex;
    flex-direction: column;
    height: 100vh;

    > main {
        display: contents;
    }
}

button {
    background: var(--foreground2);
    border: none;
    color: var(--text1);
    border-radius: 1rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
}

button:hover {
    background: var(--foreground1);
    cursor: pointer;
}

ul {
    flex: 1;
    overflow-y: scroll;
    list-style: none;

    display: flex;
    flex-direction: column-reverse;
    gap: 0.5rem;

    li {
        display: flex;
        flex-direction: column;
    }
}
</style>
