<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue";
import { visibilityEvents } from "../bootstrap/protocol.js";

const props = defineProps<{
  busy?: boolean;
  error?: boolean;
  restoring?: boolean;
  onContinue?: () => void;
  onCancel?: () => void;
  setup?: boolean;
  redirectUrl?: string;
}>();

const guardHost = window.location.host;
const appHost = props.redirectUrl ? new URL(props.redirectUrl).host : "";
const dialog = useTemplateRef("dialog");
const title = useTemplateRef("title");

function focusTitle() {
  void nextTick(() => title.value?.focus());
}

onMounted(() => {
  dialog.value?.showModal();
  visibilityEvents.addEventListener("shown", focusTitle);
});
onBeforeUnmount(() => {
  visibilityEvents.removeEventListener("shown", focusTitle);
  if (dialog.value?.open) dialog.value.close();
});
watch(() => [props.error, props.setup], focusTitle);

function continueToApp(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) return;
  const url = props.redirectUrl;
  if (!url) return;
  event.preventDefault();
  window.location.replace(url);
}
</script>
<template>
  <dialog
    ref="dialog"
    class="backdrop"
    aria-modal="true"
    aria-labelledby="storage-access-title"
    aria-describedby="storage-access-description"
    @cancel.prevent
  >
    <div class="storage-card">
      <template v-if="setup">
        <h1 id="storage-access-title" ref="title" tabindex="-1">Continue logging in</h1>
        <p id="storage-access-description">
          Continue to <strong>{{ appHost }}</strong> to finish logging in.
          Your browser may ask for permission to use your saved login there.
        </p>
        <a class="button" :href="redirectUrl" @click="continueToApp">Continue to {{ appHost }}</a>
      </template>
      <template v-else>
        <h1 id="storage-access-title" ref="title" tabindex="-1">
          {{ restoring ? "Continue with your saved login" : "Finish logging in" }}
        </h1>
        <p v-if="error" id="storage-access-description">
          Your browser didn’t allow access to your saved login.
          You can try again or keep browsing without logging in.
        </p>
        <p v-else id="storage-access-description">
          Your browser needs permission to use your saved login from
          <strong>{{ guardHost }}</strong> here.
          You can also keep browsing without logging in.
        </p>
        <button type="button" :disabled="busy" @click="onContinue">
          <span v-if="busy">
            Waiting for your browser<span class="loading-dots" aria-hidden="true" />
          </span>
          <span v-else>{{ error ? "Try again" : "Continue" }}</span>
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="onCancel"
        >Keep browsing</button>
      </template>
    </div>
  </dialog>
</template>
<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  /* Center short prompts while keeping the top of tall prompts reachable. */
  align-items: safe center;
  justify-items: center;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  margin: 0;
  border: 0;
  padding: 1rem;
  background: transparent;
}
.backdrop:not([open]) { display: none; }
.backdrop::backdrop { background: transparent; }

.storage-card {
  width: min(34rem, 100%);
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 1.5rem;
  color: var(--text-color);
  background: var(--background-color);
  box-shadow: 0 0 2.5rem rgb(0 0 0 / 90%);
  font-size: 1.25rem;
}

h1 {
  margin: 0 0 1.25rem;
  color: var(--title-color);
  font-size: 2rem;
  line-height: 1.05;
}
h1[tabindex="-1"]:focus { outline: none; }

p {
  line-height: 1.5;
}

strong {
  overflow-wrap: anywhere;
}

button,
.button {
  display: block;
  width: 100%;
  margin: 2rem 0 0;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: var(--accent-button-text);
  background: var(--accent-button-background);
  font: inherit;
  font-size: 1.375rem;
  line-height: 1.3;
  text-align: center;
  text-decoration: none;
  overflow-wrap: anywhere;
  cursor: pointer;
}

button:hover:not(:disabled),
.button:hover {
  border-color: var(--border-color-hover);
  background: var(--accent-button-background-hover);
  text-decoration: none;
}

button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.secondary {
  margin-top: 1rem;
  background: transparent;
  color: var(--text-color);
}

@media (max-width: 34rem) {
  .backdrop {
    padding: 0.75rem;
  }

  .storage-card {
    padding: 1.25rem;
  }
}
</style>
