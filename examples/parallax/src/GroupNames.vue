<script setup lang="ts">
import type { GraffitiObjectBase } from "@graffiti-garden/api";

defineProps<{
    group: GraffitiObjectBase[];
}>();
</script>
<template>
    <span
        v-for="[index, entry] in group.toReversed().entries()"
        :key="entry.url"
    >
        {{
            (entry.actor === $graffitiSession.value?.actor
                ? `${index ? "y" : "Y"}ou`
                : entry.actor) +
            (group.length > 1 && index < group.length - 1 ? " and " : "")
        }}
    </span>
</template>
