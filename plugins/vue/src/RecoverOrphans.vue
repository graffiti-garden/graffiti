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
    autopoll?: boolean;
}>();

defineSlots<{
    default?(props: {
        objects: GraffitiObject<Schema>[];
        poll: () => void;
        isInitialPolling: boolean;
    }): any;
}>();

const { objects, poll, isInitialPolling } = useGraffitiRecoverOrphans<Schema>(
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
