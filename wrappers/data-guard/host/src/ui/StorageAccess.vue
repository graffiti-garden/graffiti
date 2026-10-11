<script setup lang="ts">
const props = defineProps<{
  busy?: boolean;
  error?: boolean;
  onContinue?: () => void;
  setupUrl?: string;
  setup?: boolean;
  redirectUrl?: string;
  finishing?: boolean;
}>();

const guardHost = window.location.host;
const appHost = props.redirectUrl ? new URL(props.redirectUrl).host : "";
</script>
<template>
  <div class="backdrop">
    <dialog
      open
      aria-modal="true"
      aria-labelledby="storage-access-title"
      aria-describedby="storage-access-description"
    >
      <template v-if="setup">
        <h1 id="storage-access-title">Continue cookie setup</h1>
        <p id="storage-access-description">
          For your privacy, your browser requires this extra step before
          allowing <strong>{{ appHost }}</strong> to use cookies from
          <strong>{{ guardHost }}</strong>.
        </p>
        <a class="button" :href="redirectUrl">Continue to {{ appHost }}</a>
      </template>
      <template v-else-if="error">
        <h1 id="storage-access-title">Cookies weren’t allowed</h1>
        <p id="storage-access-description">
          This app needs cookies from <strong>{{ guardHost }}</strong> to work.
          Your browser may need you to open it directly before cookies can be
          allowed.
        </p>
        <template v-if="finishing">
          <button type="button" @click="onContinue">Try again</button>
          <a
            v-if="setupUrl"
            class="recovery-link"
            :href="setupUrl"
            target="_top"
          >
            Restart cookie setup
          </a>
        </template>
        <a v-else-if="setupUrl" class="button" :href="setupUrl" target="_top">
          Continue
        </a>
        <button v-else type="button" @click="onContinue">Try again</button>
      </template>
      <template v-else>
        <h1 id="storage-access-title">
          {{ finishing ? "One last confirmation" : "Allow cookies to continue" }}
        </h1>
        <p v-if="finishing" id="storage-access-description">
          Your browser will ask for permission next. Choose Allow to finish.
        </p>
        <p v-else id="storage-access-description">
          This site is built on the <a href="https://graffiti.garden" target="_blank">Graffiti</a> infrastructure.
          To use the app, you must allow cookies from <strong>{{ guardHost }}</strong>.
        </p>
        <button type="button" :disabled="busy" @click="onContinue">
          <span v-if="busy">
            Waiting for your browser<span class="loading-dots" aria-hidden="true" />
          </span>
          <span v-else>{{ finishing ? "Continue" : "Allow cookies and continue" }}</span>
        </button>
      </template>
    </dialog>
  </div>
</template>
<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  overflow: auto;
  padding: 1rem;
  background: transparent;
}

dialog {
  position: static;
  width: min(34rem, 100%);
  margin: 0;
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

.recovery-link {
  display: block;
  width: 100%;
  margin: 1rem 0 0;
  padding: 0.75rem 1rem;
  font-size: 1.05rem;
  line-height: 1.3;
  text-align: center;
}

@media (max-width: 34rem) {
  .backdrop {
    padding: 0.75rem;
  }

  dialog {
    padding: 1.25rem;
  }
}
</style>
