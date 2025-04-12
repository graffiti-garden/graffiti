<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import type { ChatNameObject } from "./schemas";
import { setChatName } from "./setters";
import GroupNames from "./GroupNames.vue";
import { parallaxOrProvenance } from "./parallaxOrProvenance";

const props = defineProps<{
    group: ChatNameObject[];
    myChatName: string | undefined;
    myMembers: Set<string>;
    channel: string;
    session: GraffitiSession;
    admin: string;
}>();

const name = () => props.group[0].value.name;
const includesMe = () =>
    props.group.some((c) => c.actor === props.session.actor);
</script>

<template>
    <aside>
        <p>
            <GroupNames :group="group" />
            named
            <template v-if="parallaxOrProvenance==='Parallax'">
            {{ includesMe() ? "your" : "their" }}
            {{ group.length > 1 ? "views" : "view" }}
            of
            </template>
            the chat "{{ name() }}".
        </p>
        <button
            v-if="myChatName !== name() && session.actor === admin"
            @click="
                setChatName(name(), myChatName, myMembers, channel, session)
            "
        >
            Name the chat <strong>"{{ name() }}"</strong>
        </button>
    </aside>
</template>
