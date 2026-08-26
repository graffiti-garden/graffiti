<script setup lang="ts">
import type { Request } from "../../core/db.js";
import ObjectPromptBody from "./ObjectPromptBody.vue";
defineProps<{ request: Request; canRemember: boolean; resolve: (answer: any) => void }>();
</script>
<template><ObjectPromptBody v-bind="$props" action="get" title="Allow this site to access your data?" /></template>
