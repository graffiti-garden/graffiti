<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import type { ChatNameObject } from "./schemas";
import { setChatName } from "./setters";
import GroupNames from "./GroupNames.vue";
import { parallaxOrProvenance } from "./parallaxOrProvenance";
import { ref } from "vue";

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

const saving = ref(false);
async function useName() {
    saving.value = true;
    try {
        await setChatName(
            name(),
            props.myChatName,
            props.myMembers,
            props.channel,
            props.session,
        );
    } finally {
        saving.value = false;
    }
}
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
            @click="useName"
            :disabled="saving"
        >
            <template v-if="saving">Saving...</template>
            <template v-else>
                Name the chat <strong>"{{ name() }}"</strong>
            </template>
        </button>
    </aside>
</template>
