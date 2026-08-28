<template>
    <button
        type="button"
        @click="copy"
        :aria-label="copied ? 'Copied to clipboard' : 'Copy to clipboard'"
        :disabled="copied"
    >
        {{ copied ? "Copied" : "Copy" }}
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
    text: string;
}>();

const copied = ref(false);

async function copy() {
    try {
        await navigator.clipboard.writeText(props.text);
        copied.value = true;
        setTimeout(() => {
            copied.value = false;
        }, 1500);
    } catch {
        // Intentionally silent — clipboard failures are non-fatal
    }
}
</script>

<style scoped>
button {
    font-size: 1.2rem;
    font-weight: normal;
}
</style>
