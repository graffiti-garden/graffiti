<script setup lang="ts">
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { GraffitiRuleStore } from "../core/rules.js";
import RuleStoreScope from "./RuleStoreScope.vue";

const props = defineProps<{ store: GraffitiRuleStore }>();
props.store.connect(useGraffiti());
</script>

<template>
  <RuleStoreScope
    v-for="scope in store.scopes"
    :key="scope.key"
    :store="store"
    :scope="scope"
  />
</template>
