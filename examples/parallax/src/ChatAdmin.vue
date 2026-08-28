<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { chatAdmin } from "./parallaxOrProvenance";

const props = defineProps<{
    channel: string;
    session: GraffitiSession;
}>();

const admin = chatAdmin(
    () => props.channel,
    () => props.session,
);
</script>

<template>
    <GraffitiActorToHandle v-if="admin" :actor="admin" />
</template>
