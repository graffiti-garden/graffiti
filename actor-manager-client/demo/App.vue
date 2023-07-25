<script setup>
  import { ref, reactive } from 'vue'
  import ActorClient from '../client.js'

  const ac = new ActorClient()

  const actorID = ref('')
  const message = ref('')
  const signed = reactive({})
  const verifyLoading = ref(false)
  const verified = ref(false)
</script>

<template>
  <form @submit.prevent="ac.selectActor().then(id=>actorID=id)">
    <input type="submit" value="Select Actor">
  </form>

  <p>
    Your Actor ID is: "{{ actorID }}"
  </p>

  <form @submit.prevent="ac.sign({message}, actorID).then(s=>{Object.assign(signed,s);message=''})">
    <input v-model="message">
    <input type="submit" value="Sign Message">
  </form>

  <p>
    Your signed message: "{{ signed }}"
  </p>

  <form @submit.prevent="verifyLoading=true;ac.verify(signed).then(()=>verified=true).catch(()=> verified=false).finally(()=> verifyLoading=false)">
    <input type="submit" value="Verify Signed Message">
  </form>

  <p>
    Message Verified?
    <template v-if="verifyLoading">
      Loading...
    </template>
    <template v-else>
      {{ verified }}
    </template>
  </p>
</template>