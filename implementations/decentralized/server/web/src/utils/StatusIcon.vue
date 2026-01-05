<template>
    <span class="status" aria-hidden="true" :data-status="status"></span>
</template>

<script setup lang="ts">
const props = defineProps<{
    status: "ok" | "error" | "loading" | null;
}>();
</script>

<style scoped>
.status {
    width: 1.25rem;
    height: 1.25rem;
    place-items: center;
    flex: 0 0 auto;
}

.status::before {
    content: "";
    width: 1.25rem;
    height: 1.25rem;
    display: inline-block;
}

.status[data-status="ok"]::before {
    background: var(--pico-icon-valid) no-repeat center/contain;
}
.status[data-status="error"]::before {
    background: var(--pico-icon-invalid) no-repeat center/contain;
}
@media (prefers-reduced-motion: no-preference) {
    .status[data-status="loading"]::before {
        border-radius: 999px;
        border: 2px solid
            color-mix(in srgb, var(--pico-muted-color) 35%, transparent);
        border-top-color: var(--pico-muted-color);
        animation: spin 0.9s linear infinite;
    }
}
@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
