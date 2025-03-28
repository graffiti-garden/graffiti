<script setup lang="ts" generic="Schema extends JSONSchema">
import { toRef } from "vue";
import type {
    GraffitiSession,
    JSONSchema,
    GraffitiObject,
} from "@graffiti-garden/api";
import { useGraffitiDiscover } from "./composables";

const props = defineProps<{
    channels: string[];
    schema: Schema;
    session?: GraffitiSession | null;
    autopoll?: boolean;
}>();

defineSlots<{
    default?(props: {
        objects: GraffitiObject<Schema>[];
        results: GraffitiObject<Schema>[];
        poll: () => void;
        isPolling: boolean;
        isInitialPolling: boolean;
    }): any;
}>();

const { objects, results, poll, isPolling, isInitialPolling } =
    useGraffitiDiscover<Schema>(
        toRef(props, "channels"),
        toRef(props, "schema"),
        toRef(props, "session"),
        toRef(props, "autopoll"),
    );
</script>

<template>
    <slot
        :objects="objects"
        :results="results"
        :poll="poll"
        :isPolling="isPolling"
        :isInitialPolling="isInitialPolling"
    ></slot>
</template>
