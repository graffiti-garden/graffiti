<script setup>
  import { ref } from 'vue'
  let me = ref('')
</script>

<template>
  <p>
    <button @click="$gf.selectActor().then(actor=>me=actor)">
      Select Actor
    </button>
  </p>

  <p>
    Your Actor ID is: "{{ me }}"
  </p>
</template>