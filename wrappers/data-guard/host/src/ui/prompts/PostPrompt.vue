<script setup lang="ts">
import type { Request } from "../../core/db.js";
import ObjectPromptBody from "./ObjectPromptBody.vue";
defineProps<{ request: Request; canRemember: boolean; resolve: (answer: any) => void }>();
</script>
<template><ObjectPromptBody v-bind="$props" action="post" title="Allow this site to modify your data?" /></template>
