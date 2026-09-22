<script setup lang="ts">
import type { GraffitiRuleStore } from "../core/rules.js";
import RuleStoreHost from "./RuleStoreHost.vue";
import { componentState } from "./show.js";

defineProps<{ ruleStore: GraffitiRuleStore }>();
</script>

<template>
  <RuleStoreHost v-if="ruleStore.state.active" :store="ruleStore" />
  <component
    :is="componentState.component"
    v-if="componentState.component"
    v-bind="componentState.props"
  />
</template>
