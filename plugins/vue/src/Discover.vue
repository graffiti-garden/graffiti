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
        poll: () => void;
        isInitialPolling: boolean;
    }): any;
}>();

const { objects, poll, isInitialPolling } = useGraffitiDiscover<Schema>(
    toRef(props, "channels"),
    toRef(props, "schema"),
    toRef(props, "session"),
    toRef(props, "autopoll"),
);
</script>

<template>
    <slot
        :objects="objects"
        :poll="poll"
        :isInitialPolling="isInitialPolling"
    ></slot>
</template>
