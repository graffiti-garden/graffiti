<script setup>
  import { ref, reactive } from 'vue'
  import ActorClient from '../client.js'

  const ac = new ActorClient()

  const actorID = ref('')
  const message = ref('')
  const signed = ref('')
  const error = ref(null)
  const result = reactive({})
</script>

<template>
  <form @submit.prevent="ac.selectActor().then(id=>actorID=id)">
    <input type="submit" value="Select Actor">
  </form>

  <p>
    Your Actor ID is: "{{ actorID }}"
  </p>

  <form @submit.prevent="ac.sign(message).then(s=>{signed=s;message=''})">
    <input v-model="message">
    <input type="submit" value="Sign Message">
  </form>

  <p>
    Your signed message: "{{ signed }}"
  </p>

  <form @submit.prevent="error=null;ac.verify(signed).then(r=>Object.assign(result,r)).catch(e=>error=e.toString())">
    <input type="submit" value="Verify Signed Message">
  </form>

  <p>
    Message Verified?
    <template v-if="error">
      {{ error }}
    </template>
    <template v-else>
      {{ result }}
    </template>
  </p>
</template>