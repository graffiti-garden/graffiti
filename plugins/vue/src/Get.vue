<script setup lang="ts" generic="Schema extends JSONSchema">
import { toRef } from "vue";
import type {
    GraffitiObjectUrl,
    GraffitiObject,
    GraffitiSession,
    JSONSchema,
} from "@graffiti-garden/api";
import { useGraffitiGet } from "./composables";

const props = defineProps<{
    url: string | GraffitiObjectUrl;
    schema: Schema;
    session?: GraffitiSession | null;
    autopoll?: boolean;
}>();

defineSlots<{
    default?(props: {
        object: GraffitiObject<Schema> | undefined | null;
        poll: () => void;
        isInitialPolling: boolean;
    }): any;
}>();

const { object, poll, isInitialPolling } = useGraffitiGet<Schema>(
    toRef(props, "url"),
    toRef(props, "schema"),
    toRef(props, "session"),
    toRef(props, "autopoll"),
);
</script>

<template>
    <slot
        :object="object"
        :poll="poll"
        :isInitialPolling="isInitialPolling"
    ></slot>
</template>
