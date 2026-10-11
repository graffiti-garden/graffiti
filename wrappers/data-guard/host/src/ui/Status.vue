<script setup lang="ts">
defineProps<{ message: string; loading?: boolean }>();
</script>

<template>
  <main>
    <div class="status">
      <h1 v-if="loading" aria-live="polite">
        {{ message }}<span class="loading-dots" aria-hidden="true" />
      </h1>
      <template v-else>
        <h1>Graffiti Guard</h1>
        <p role="status">{{ message }}</p>
      </template>
    </div>
  </main>
</template>

<style scoped>
main {
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  padding: 1rem;
  color: var(--text-color);
  background: var(--background-color);
  text-align: center;
}

.status {
  max-width: 100%;
}

h1 {
  color: var(--title-color);
  font-size: clamp(1.5rem, 6vw, 2rem);
  line-height: 1.2;
}

p {
  margin-top: 0.75rem;
  font-size: 1.125rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
</style>
