<script setup lang="ts">
import ResolveString from "./ResolveString.vue";
import { useGraffiti } from "../globals";

const props = defineProps<{ actor: string }>();
const graffiti = useGraffiti();
</script>

<template>
    <ResolveString
        :input="props.actor"
        :resolve="graffiti.actorToHandle.bind(graffiti)"
        v-slot="{ output, displayText }"
    >
        <slot :handle="output">
            <span> {{ displayText(output) }} </span>
        </slot>
    </ResolveString>
</template>
