<script setup lang="ts">
import { componentState } from "./show.js";
</script>

<template>
  <component
    :is="componentState.component"
    v-if="componentState.component"
    v-bind="componentState.props"
  />
</template>
