<script setup lang="ts" generic="Schema extends JSONSchema4">
import { toRef } from "vue";
import type { GraffitiSession, JSONSchema4 } from "@graffiti-garden/api";
import { useGraffitiDiscover } from "./composables";

const props = defineProps<{
    channels: string[];
    schema: Schema;
    session?: GraffitiSession;
}>();

const { results, poll, isPolling } = useGraffitiDiscover<Schema>(
    toRef(props, "channels"),
    toRef(props, "schema"),
    toRef(props, "session"),
);
</script>

<template>
    <slot :results="results" :poll="poll" :isPolling="isPolling"></slot>
</template>
