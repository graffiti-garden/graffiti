<script setup>
  import { ref } from 'vue'
  import ActorClient from '../client.js'

  const ac = new ActorClient()

  const actorID = ref('')
</script>

<template>
  <form @submit.prevent="ac.selectActor().then(id=>actorID=id)">
    <input type="submit" value="Select Actor">
  </form>

  <p>
    Your Actor ID is: "{{ actorID }}"
  </p>
</template>