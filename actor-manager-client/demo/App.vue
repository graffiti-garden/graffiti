<script setup>
  import { ref } from 'vue'
  import ActorClient from '../client.js'

  const ac = new ActorClient()

  const actorID = ref('')
  const message = ref('')
  const signed = reactive({})
</script>

<template>
  <form @submit.prevent="ac.selectActor().then(id=>actorID=id)">
    <input type="submit" value="Select Actor">
  </form>

  <p>
    Your Actor ID is: "{{ actorID }}"
  </p>

  <form @submit.prevent="ac.sign({message}).then(s=>{Object.assign(signed,s);message=''})">
    <input v-model="message">
    <input type="submit" value="Sign Message">
  </form>

  <p>
    Your signed message: "{{ signed }}"
  </p>
</template>