<script setup lang="ts">
import { useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { watch } from "vue";
import {
  GraffitiRuleStore,
  ruleSchema,
  type RuleScope,
} from "../core/rules.js";

const props = defineProps<{ store: GraffitiRuleStore; scope: RuleScope }>();
const { objects, isFirstPoll } = useGraffitiDiscover(
  () => [props.scope.source.key],
  () => ruleSchema(props.scope.actor),
  () => props.scope.session,
);

watch(
  [objects, isFirstPoll],
  ([currentObjects, loading]) =>
    props.store.update(props.scope, currentObjects, !loading),
  { immediate: true },
);
</script>

<template></template>
