<script setup lang="ts">
import { toRef } from "vue";
import { displayOutput } from "../composables/resolve-string";
import { useGraffitiActorToHandle } from "../composables/actor-to-handle";

const props = defineProps<{ actor: string }>();
const actor = toRef(props, "actor");

const { handle, error } = useGraffitiActorToHandle(actor);
</script>

<template>
    <slot :handle="handle" :error="error">
        <span v-if="error">Could not load handle</span>
        <span v-else>{{ displayOutput(handle) }}</span>
    </slot>
</template>
