<script setup lang="ts">
import type { Request } from "../../core/db.js";
import PromptBody from "./shared/PromptBody.vue";
defineProps<{ request: Request; canRemember: boolean; resolve: (answer: any) => void }>();
</script>
<template><PromptBody v-bind="$props" title="Allow this site to access your data?" summary="wants to search your data." remember-label="Allow For All Similar Queries" channels /></template>
