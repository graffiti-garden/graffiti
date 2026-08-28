<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { chatNameSchema, type ChatNameObject } from "./schemas";
import { sortByPublished } from "./utils";
import { chatAdmin } from "./parallaxOrProvenance";

const props = defineProps<{
    channel: string;
    session: GraffitiSession;
}>();

const admin = chatAdmin(
    () => props.channel,
    () => props.session,
);

const { objects, isFirstPoll } = useGraffitiDiscover(
    () => [props.channel],
    () => chatNameSchema(props.channel, admin.value),
    () => props.session,
);
const chatNames = sortByPublished<ChatNameObject>(objects);

const myChatName = () => chatNames.value.at(0)?.value.name;
</script>

<template>
    <span v-if="isFirstPoll"> Loading... </span>
    <span v-else-if="!myChatName()"> Unnamed Chat </span>
    <span v-else>
        {{ myChatName() }}
    </span>
</template>
