<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import type { Ref } from 'vue'
  import ActorClient, { base64Encode, base64Decode } from '../client';

  const actorID: Ref<null|string> = ref(null)

  const ac = new ActorClient((actorURI: string|null)=> {
    actorID.value = actorURI
  })

  const encoder = new TextEncoder()
  const message: Ref<string> = ref('')
  const signed: Ref<string> = ref('')
  const result: Ref<null|boolean> = ref(null)
</script>

<template>
  <form @submit.prevent="ac.selectActor()">
    <input type="submit" value="Select Actor">
  </form>

  <p>
    Your Actor ID is: "{{ actorID }}"
  </p>

  <form @submit.prevent="ac.sign(encoder.encode(message)).then(s=>{signed=base64Encode(s)})">
    <input v-model="message">
    <input type="submit" value="Sign Message">
  </form>

  <p v-if="signed">
    Your signature: "{{ signed }}"
  </p>

  <form v-if="signed&&actorID" @submit.prevent="
    ac.verify(base64Decode(signed), encoder.encode(message), actorID).then(r=>result=r)">
    <input type="submit" value="Verify Signed Message">
  </form>

  <p v-if="result!==null">
    Message Verified? {{ result }}
  </p>
</template>