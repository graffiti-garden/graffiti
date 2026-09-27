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
        error: Error | null;
        poll: () => Promise<void>;
        isFirstPoll: boolean;
    }): any;
}>();

const { objects, error, poll, isFirstPoll } = useGraffitiDiscover<Schema>(
    toRef(() => props.channels),
    toRef(() => props.schema),
    toRef(() => props.session),
    toRef(() => props.autopoll),
);
</script>

<template>
    <slot :objects="objects" :error="error" :poll="poll" :isFirstPoll="isFirstPoll">
        <p v-if="error"><em>Graffiti discovery failed; retrying...</em></p>
        <ul v-else-if="!isFirstPoll">
            <li v-for="object in objects" :key="object.url">
                <ObjectInfo :object="object" />
            </li>
        </ul>
        <p v-else>
            <em> Graffiti discover loading... </em>
        </p>
    </slot>
</template>
