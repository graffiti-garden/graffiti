<script setup lang="ts">
import type { Request } from "../../core/db.js";
import MediaPromptBody from "./MediaPromptBody.vue";
defineProps<{ request: Request; canRemember: boolean; resolve: (answer: any) => void; preview?: any }>();
</script>
<template><MediaPromptBody v-bind="$props" action="delete" /></template>
