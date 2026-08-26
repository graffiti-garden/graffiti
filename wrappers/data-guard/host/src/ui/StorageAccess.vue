<script setup lang="ts">
defineProps<{ busy?: boolean; error?: boolean; onContinue?: () => void }>();
</script>
<template>
  <section>
    <template v-if="error"><h1>Storage access was not granted</h1><p>Reload the app to try again. The guard needs access to its session and permission database.</p></template>
    <template v-else><h1>Allow session access</h1><p>Continue to let the embedded guard access its Graffiti session and browser storage.</p><button type="button" :disabled="busy" @click="onContinue">{{ busy ? "Requesting access..." : "Continue" }}</button></template>
  </section>
</template>
<style scoped>section { padding: 1rem; } button { margin-top: 1rem; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.35rem 0.7rem; color: var(--accent-button-text); background: var(--accent-button-background); }</style>
