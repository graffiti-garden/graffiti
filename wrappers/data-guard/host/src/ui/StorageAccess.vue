<script setup lang="ts">
defineProps<{ busy?: boolean; error?: boolean; onContinue?: () => void }>();

const guardHost = window.location.host;
</script>
<template>
  <div class="backdrop">
    <dialog
      open
      aria-modal="true"
      aria-labelledby="storage-access-title"
      aria-describedby="storage-access-description"
    >
      <template v-if="error">
        <h1 id="storage-access-title">Cookies weren’t allowed</h1>
        <p id="storage-access-description">
          This app needs cookies from <strong>{{ guardHost }}</strong> to work.
          Check your browser settings or refresh, then try again.
        </p>
        <button type="button" @click="onContinue">Try again</button>
      </template>
      <template v-else>
        <h1 id="storage-access-title">Allow cookies to continue</h1>
        <p id="storage-access-description">
          This site is built on the <a href="https://graffiti.garden" target="_blank">Graffiti</a> infrastructure.
          To use the app, you must allow cookies from <strong>{{ guardHost }}</strong>.
        </p>
        <button type="button" :disabled="busy" @click="onContinue">
          {{ busy ? "Waiting for your browser…" : "Allow cookies and continue" }}
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
  place-items: center;
  overflow: auto;
  padding: 1rem;
  background: transparent;
}

dialog {
  position: static;
  width: min(34rem, calc(100vw - 2rem));
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

button {
  display: block;
  margin: 2rem 0 0 auto;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.4rem 0.75rem;
  color: var(--accent-button-text);
  background: var(--accent-button-background);
  font: inherit;
}

button:hover:not(:disabled) {
  border-color: var(--border-color-hover);
  background: var(--accent-button-background-hover);
  text-decoration: none;
}

button:disabled {
  cursor: wait;
  opacity: 0.7;
}

@media (max-width: 34rem) {
  .backdrop {
    padding: 0.75rem;
  }

  dialog {
    width: 100%;
    padding: 1.25rem;
  }

  button {
    width: 100%;
  }
}
</style>
