<script setup lang="ts" generic="Schema extends JSONSchema">
import { toRef } from "vue";
import type {
    GraffitiSession,
    JSONSchema,
    GraffitiObject,
} from "@graffiti-garden/api";
import { useGraffitiDiscover } from "../composables/discover";
import ObjectInfo from "./ObjectInfo.vue";

const props = defineProps<{
    channels: string[];
    schema: Schema;
    session?: GraffitiSession | null;
    autopoll?: boolean;
}>();

defineSlots<{
    default?(props: {
        objects: GraffitiObject<Schema>[];
        poll: () => Promise<void>;
        isFirstPoll: boolean;
    }): any;
}>();

const { objects, poll, isFirstPoll } = useGraffitiDiscover<Schema>(
    toRef(props, "channels"),
    toRef(props, "schema"),
    toRef(props, "session"),
    toRef(props, "autopoll"),
);
</script>

<template>
    <slot :objects="objects" :poll="poll" :isFirstPoll="isFirstPoll">
        <ul v-if="!isFirstPoll">
            <li v-for="object in objects" :key="object.url">
                <ObjectInfo :object="object" />
            </li>
        </ul>
        <p v-else>
            <em> Loading... </em>
        </p>
    </slot>
</template>
