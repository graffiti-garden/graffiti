<template>
    <button type="button" @click="copy" :aria-label="`Copy ${label} to clipboard`">
        {{ copied ? "Copied" : "Copy" }}
    </button>
    <span class="visually-hidden" role="status">{{ status }}</span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

const props = defineProps<{
    text: string;
    label: string;
}>();

const copied = ref(false);
const status = ref("");
let resetTimer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
    try {
        await navigator.clipboard.writeText(props.text);
        copied.value = true;
        status.value = `${props.label} copied to clipboard.`;
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
            copied.value = false;
        }, 1500);
    } catch {
        status.value = `Could not copy ${props.label}.`;
    }
}
onBeforeUnmount(() => clearTimeout(resetTimer));
</script>

<style scoped>
button {
    font-size: 1.2rem;
    font-weight: normal;
}
</style>
