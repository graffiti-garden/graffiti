<script setup lang="ts">
import type { GraffitiSession, JSONSchema } from "@graffiti-garden/api";
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { chatNameSchema } from "./schemas";
import { sortByPublished } from "./utils";
import type { ChatNameObject } from "./schemas";

const props = defineProps<{
    channel: string;
    session: GraffitiSession;
}>();

const { objects, isInitialPolling } = useGraffitiDiscover(
    () => [props.channel],
    () => chatNameSchema(props.channel, props.session.actor),
);
const chatNames = sortByPublished<ChatNameObject>(objects);

const myChatName = () => chatNames.value.at(0)?.value.name;
</script>

<template>
    <span v-if="isInitialPolling"> Loading... </span>
    <span v-else-if="!myChatName()"> Unnamed Chat </span>
    <span v-else>
        {{ myChatName() }}
    </span>
</template>
