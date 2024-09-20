<script setup lang="ts" generic="Schema extends JSONSchema4">
import { toRef } from "vue";
import type {
    GraffitiSession,
    JSONSchema4,
} from "@graffiti-garden/client-core";
import { useDiscover } from "./composables";

const props = defineProps<{
    channels: string[];
    schema: Schema;
    session?: GraffitiSession;
    ifModifiedSince?: Date;
}>();

const { results, poll, isPolling } = useDiscover<Schema>(
    toRef(props, "channels"),
    toRef(props, "schema"),
    toRef(props, "session"),
    () => ({
        ifModifiedSince: props.ifModifiedSince,
    }),
);
</script>

<template>
    <slot :results="results" :poll="poll" :isPolling="isPolling"></slot>
</template>
