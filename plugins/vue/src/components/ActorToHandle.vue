<script setup lang="ts">
import { toRef } from "vue";
import { displayOutput } from "../composables/resolve-string";
import { useGraffitiActorToHandle } from "../composables/actor-to-handle";

const props = defineProps<{ actor: string }>();
const actor = toRef(props, "actor");

const { handle } = useGraffitiActorToHandle(actor);
</script>

<template>
    <slot :handle="handle">
        <span> {{ displayOutput(handle) }} </span>
    </slot>
</template>
