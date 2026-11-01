<script setup lang="ts">
import { computed } from "vue";
import type { Request } from "../../core/db.js";
import type { GuardAnswer } from "../../core/guard.js";
import { sourceLabel } from "../../core/source.js";
import { GraffitiActorToHandle } from "@graffiti-garden/wrapper-vue";
import PromptFrame from "./shared/PromptFrame.vue";

const props = defineProps<{ request: Request; resolve: (answer: GuardAnswer) => void }>();
const site = computed(() => sourceLabel(props.request.source));
</script>

<template>
  <PromptFrame title="Log out?" :cancel="() => resolve(false)" :confirming="false">
    <p>You’re logged in as <strong><GraffitiActorToHandle :actor="request.actor" v-slot="{ handle }">{{ handle ?? '…' }}</GraffitiActorToHandle></strong> at <strong>{{ site }}</strong>.</p>
    <template #actions>
      <div class="choices">
        <button type="button" class="deny" @click="resolve(false)">Cancel</button>
        <div class="split-action">
          <button type="button" @click="resolve({ logout: 'site' })">Log out</button>
          <details class="guard-options">
            <summary class="prompt-action" aria-label="More log out options"><span aria-hidden="true">▾</span></summary>
            <div class="guard-menu">
              <button type="button" @click="resolve({ logout: 'device' })">Log out everywhere on this device</button>
            </div>
          </details>
        </div>
      </div>
    </template>
  </PromptFrame>
</template>

<style scoped>
p { margin: 0; line-height: 1.4; overflow-wrap: anywhere; }
.choices { display: flex; justify-content: space-between; gap: 0.75rem; }
.choices > button { width: auto; min-width: 0; }
</style>
