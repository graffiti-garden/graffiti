<script setup lang="ts" generic="Schema extends JSONSchema">
import { toRef } from "vue";
import type {
    GraffitiLocation,
    GraffitiObject,
    GraffitiSession,
    JSONSchema,
} from "@graffiti-garden/api";
import { useGraffitiGet } from "./composables";

const props = defineProps<{
    locationOrUri: string | GraffitiLocation;
    schema: Schema;
    session?: GraffitiSession | null;
}>();

defineSlots<{
    default?(props: {
        result: GraffitiObject<Schema> | undefined | null;
        poll: () => void;
        isPolling: boolean;
    }): any;
}>();

const { result, poll, isPolling } = useGraffitiGet<Schema>(
    toRef(props, "locationOrUri"),
    toRef(props, "schema"),
    toRef(props, "session"),
);
</script>

<template>
    <slot :result="result" :poll="poll" :isPolling="isPolling"></slot>
</template>
