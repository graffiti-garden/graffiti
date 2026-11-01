<script setup lang="ts">
import PromptFrame from "./prompts/shared/PromptFrame.vue";

defineProps<{
  site: string;
  accounts: { actor: string; handle?: string | null }[];
  choose: (actor: string) => void;
  loginAnother: () => void;
  cancel: () => void;
}>();
</script>

<template>
  <PromptFrame :title="`Log in to ${site}?`" :cancel="cancel" :confirming="false">
    <p>This site will learn what your handle is and be able to post as you within the site.</p>
    <section class="account-choice" aria-labelledby="account-choice-title">
      <h2 id="account-choice-title">Log in as…</h2>
      <div class="accounts">
        <button
          v-for="account in accounts"
          :key="account.actor"
          type="button"
          class="prompt-action"
          :disabled="!account.handle"
          @click="choose(account.actor)"
        >{{ account.handle ?? (account.handle === null ? 'Account unavailable' : 'Account loading…') }}</button>
        <button type="button" class="prompt-action deny" @click="loginAnother">Another account</button>
      </div>
    </section>
    <template #actions>
      <button type="button" class="prompt-action deny" @click="cancel">Cancel</button>
    </template>
  </PromptFrame>
</template>

<style scoped>
p { margin: 0; line-height: 1.4; overflow-wrap: anywhere; }
.account-choice { min-width: 0; border: 1px solid var(--border-color); border-radius: 0.5rem; background: color-mix(in srgb, var(--background-color-interactive) 62%, var(--background-color)); }
h2 { margin: 0; border-bottom: 1px solid var(--border-color); padding: 0.75rem; font: inherit; font-weight: 700; }
.accounts { display: grid; gap: 0.75rem; padding: 0.75rem; }
.accounts button { text-align: left; }
.accounts button:disabled { opacity: 0.6; cursor: default; }
</style>
