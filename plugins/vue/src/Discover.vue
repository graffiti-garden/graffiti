<script setup lang="ts" generic="Schema extends JSONSchema4">
import { toRef } from "vue";
import { type JSONSchema4 } from "json-schema";
import { useDiscover } from "./composables";

const props = defineProps<{
    channels: string[];
    schema: Schema;
    session: {
        pods: string[];
    } & (
        | {
              fetch: typeof window.fetch;
              webId: string;
          }
        | {
              fetch?: undefined;
              webId?: undefined;
          }
    );
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
