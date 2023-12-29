<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import type { Ref } from 'vue'
  import ActorClient, { base64Encode, base64Decode } from '../actor-client';

  const actorID: Ref<null|string> = ref(null)

  const ac = new ActorClient((actorURI: string|null)=> {
    actorID.value = actorURI
  })

  const encoder = new TextEncoder()
  const message: Ref<string> = ref('')
  const signed: Ref<string> = ref('')
  const result: Ref<null|boolean> = ref(null)
  const theirURI: Ref<string> = ref('')
  const sharedSecret: Ref<string> = ref('')
  const nonce: Ref<Uint8Array> = ref(new Uint8Array(24))
  const noncedSecret: Ref<string> = ref('')

  function generateNonce() {
    const value = new Uint8Array(24)
    crypto.getRandomValues(value)
    nonce.value = value
  }
  generateNonce()
</script>

<template>
  <form @submit.prevent="ac.selectActor()">
    <input type="submit" value="Select Actor">
  </form>

  <p>
    Your Actor ID is: "{{ actorID }}"
  </p>

  <template v-if="actorID">

    <hr>

    <form @submit.prevent="ac.sign(encoder.encode(message)).then(s=>{signed=base64Encode(s);result=null})">
      <input v-model="message">
      <input type="submit" value="Sign Message">
    </form>

    <p v-if="signed">
      Your signature: {{ signed }}
    </p>

    <form v-if="signed" @submit.prevent="
      ac.verify(base64Decode(signed), encoder.encode(message), actorID).then(r=>result=r)">
      <input type="submit" value="Verify Signed Message">
      <span v-if="result!==null">
        {{ result }}
      </span>
    </form>

    <hr>

    <form @submit.prevent="ac.sharedSecret(theirURI).then(s=>sharedSecret=base64Encode(s))">
      <input v-model="theirURI">
      <input type="submit" value="Get Shared Secret">
    </form>

    <p v-if="sharedSecret">
      Shared Secret: {{ sharedSecret }}
    </p>

    <hr>

    <p>
      <button @click="generateNonce()">
        Generate Nonce
      </button>
      Nonce: {{ base64Encode(nonce) }}
    </p>

    <p>
      <button @click="ac.noncedSecret(nonce).then(s=>noncedSecret=base64Encode(s))">
        Generate Nonced Secret
      </button>
    </p>

    <p v-if="noncedSecret">
      Nonced Secret: {{ noncedSecret }}
    </p>
  </template>

</template>