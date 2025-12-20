<script setup lang="ts">
import { toRef } from "vue";
import { displayOutput } from "../composables/resolve-string";
import { useGraffitiHandleToActor } from "../composables/handle-to-actor";

const props = defineProps<{ handle: string }>();
const handle = toRef(props, "handle");

const { actor } = useGraffitiHandleToActor(handle);
</script>

<template>
    <slot :actor="actor">
        <span> {{ displayOutput(actor) }} </span>
    </slot>
</template>
