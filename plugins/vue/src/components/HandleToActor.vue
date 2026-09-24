<script setup lang="ts">
import { toRef } from "vue";
import { displayOutput } from "../composables/resolve-string";
import { useGraffitiHandleToActor } from "../composables/handle-to-actor";

const props = defineProps<{ handle: string }>();
const handle = toRef(props, "handle");

const { actor, error } = useGraffitiHandleToActor(handle);
</script>

<template>
    <slot :actor="actor" :error="error">
        <span v-if="error">Could not load account</span>
        <span v-else>{{ displayOutput(actor) }}</span>
    </slot>
</template>
