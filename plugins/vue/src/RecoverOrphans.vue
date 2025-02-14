<script setup lang="ts" generic="Schema extends JSONSchema">
import { toRef } from "vue";
import type {
    GraffitiSession,
    JSONSchema,
    GraffitiObject,
} from "@graffiti-garden/api";
import { useGraffitiRecoverOrphans } from "./composables";

const props = defineProps<{
    schema: Schema;
    session: GraffitiSession;
}>();

defineSlots<{
    default?(props: {
        results: GraffitiObject<Schema>[];
        poll: () => void;
        isPolling: boolean;
    }): any;
}>();

const { results, poll, isPolling } = useGraffitiRecoverOrphans<Schema>(
    toRef(props, "schema"),
    toRef(props, "session"),
);
</script>

<template>
    <slot :results="results" :poll="poll" :isPolling="isPolling"></slot>
</template>
