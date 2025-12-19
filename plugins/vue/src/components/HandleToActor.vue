<script setup lang="ts">
import ResolveString from "./ResolveString.vue";
import { useGraffiti } from "../globals";

const props = defineProps<{ handle: string }>();
const graffiti = useGraffiti();
</script>

<template>
    <ResolveString
        :input="props.handle"
        :resolve="graffiti.handleToActor.bind(graffiti)"
        v-slot="{ output, displayText }"
    >
        <slot :actor="output">
            <span> {{ displayText(output) }} </span>
        </slot>
    </ResolveString>
</template>
