<script setup lang="ts">
import { ref, watch } from "vue";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";

type Resolver = (input: string) => Promise<string>;

const props = defineProps<{
    input: string;
    resolve: Resolver;
}>();

const output = ref<string | null | undefined>(undefined);

watch(
    () => props.input,
    async (input, _prev, onInvalidate) => {
        let active = true;
        onInvalidate(() => {
            active = false;
        });

        output.value = undefined;

        try {
            const resolved = await props.resolve(input);
            if (active) output.value = resolved;
        } catch (err) {
            if (!active) return;

            if (err instanceof GraffitiErrorNotFound) {
                output.value = null;
            } else {
                console.error(err);
            }
        }
    },
    { immediate: true },
);

function displayText(output: string | null | undefined) {
    if (output === undefined) return "Loading...";
    if (output === null) return "Not found";
    return output;
}
</script>

<template>
    <slot :output="output" :displayText="displayText"></slot>
</template>
