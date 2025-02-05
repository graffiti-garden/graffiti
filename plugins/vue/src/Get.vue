<script setup lang="ts" generic="Schema extends JSONSchema4">
import { toRef } from "vue";
import type {
    GraffitiLocation,
    GraffitiSession,
    JSONSchema4,
} from "@graffiti-garden/api";
import { useGraffitiGet } from "./composables";

const props = defineProps<{
    locationOrUri: string | GraffitiLocation;
    schema: Schema;
    session?: GraffitiSession | null;
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
