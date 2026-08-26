<script setup lang="ts">
import type { Request } from "../../core/db.js";
import PromptBody from "./shared/PromptBody.vue";
defineProps<{ request: Request; canRemember: boolean; resolve: (answer: any) => void }>();
</script>
<template><PromptBody v-bind="$props" title="Allow this site to log you out?" summary="wants to end your Graffiti session." remember-label="Remember Logouts" :details="false" /></template>
