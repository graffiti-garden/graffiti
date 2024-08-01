<script setup lang="ts">
import { toRef, toRefs, type PropType, type MaybeRefOrGetter } from "vue";
import { useQuery } from "./composables";
import type { JSONSchema4 } from "json-schema";

const props = defineProps({
    channels: {
        type: Array as PropType<MaybeRefOrGetter<string>[]>,
        required: true,
    },
    query: {
        type: Object as PropType<JSONSchema4>,
        default: undefined,
    },
    fetch: {
        type: Function as PropType<typeof window.fetch>,
        default: undefined,
    },
    skip: {
        type: Number,
        default: undefined,
    },
    limit: {
        type: Number,
        default: undefined,
    },
    ifModifiedSince: {
        type: Date,
        default: undefined,
    },
    pods: {
        type: Array as PropType<string[]>,
        default: undefined,
    },
});

const { results, poll, isPolling } = useQuery(
    toRef(props, "channels"),
    toRefs(props),
);
</script>

<template>
    <slot :results="results" :poll="poll" :isPolling="isPolling"></slot>
</template>
