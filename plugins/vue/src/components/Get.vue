<script setup lang="ts" generic="Schema extends JSONSchema">
import { toRef } from "vue";
import type {
    GraffitiObjectUrl,
    GraffitiObject,
    GraffitiSession,
    JSONSchema,
} from "@graffiti-garden/api";
import { useGraffitiGet } from "../composables/get";
import ObjectInfo from "./ObjectInfo.vue";

const props = defineProps<{
    url: string | GraffitiObjectUrl;
    schema: Schema;
    session?: GraffitiSession | null;
}>();

defineSlots<{
    default?(props: {
        object: GraffitiObject<Schema> | undefined | null;
        error: Error | null;
        poll: () => Promise<void>;
    }): any;
}>();

const { object, error, poll } = useGraffitiGet<Schema>(
    toRef(() => props.url),
    toRef(() => props.schema),
    toRef(() => props.session),
);
</script>

<template>
    <slot :object="object" :error="error" :poll="poll">
        <p v-if="error"><em>Graffiti object could not be loaded</em></p>
        <ObjectInfo v-else :object="object" />
    </slot>
</template>
