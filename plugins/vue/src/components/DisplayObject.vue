<script setup lang="ts">
import type { GraffitiObjectBase } from "@graffiti-garden/api";

defineProps<{
    object: GraffitiObjectBase;
}>();
</script>

<template>
    <article data-url="object.url">
        <!-- The URI of the person who created the object -->
        <!-- (it is an ugly DID) -->
        {{ object.actor }}
        <!-- The username of the person who created the object -->
        <ActorToHandle :actor="object.actor" />
        <!-- The content of the object as JSON -->
        {{ object.value }}
        <!-- THe actor IDs of all the other people who
        have access to the object -->
        {{ object.allowed }}
        <!-- The channels the object is published to -->
        {{ object.channels }}
    </article>
</template>
