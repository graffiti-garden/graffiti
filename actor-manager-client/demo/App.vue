<script setup lang="ts">
  import { ref } from 'vue'
  import type { Ref } from 'vue'
  import ActorManager, { base64Encode, base64Decode } from '../index';

  const actorID: Ref<null|string> = ref(null)

  const am = new ActorManager((actorURI: string|null)=> {
    actorID.value = actorURI
  })

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const message: Ref<string> = ref('')
  const signed: Ref<string> = ref('')
  const result: Ref<null|boolean> = ref(null)

  const theirURI: Ref<string> = ref('')
  const plaintextIn: Ref<string> = ref('')
  const ciphertextOut: Ref<string> = ref('')
  const ciphertextIn: Ref<string> = ref('')
  const plaintextOut: Ref<string> = ref('')

  const nonce: Ref<Uint8Array> = ref(new Uint8Array(24))
  const oneTimePublicKey: Ref<string> = ref('')
  const oneTimeMessage: Ref<string> = ref('')
  const oneTimeSignature: Ref<string> = ref('')
  const oneTimeResult: Ref<boolean|null> = ref(null)

  function generateNonce() {
    const value = new Uint8Array(24)
    crypto.getRandomValues(value)
    nonce.value = value
  }
  generateNonce()
</script>

<template>
  <form @submit.prevent="am.selectActor()">
    <input type="submit" value="Select Actor">
  </form>

  <p>
    Your Actor ID is: "{{ actorID }}"
  </p>

  <template v-if="actorID">

    <hr>

    <form @submit.prevent="am.sign(encoder.encode(message)).then(s=>{signed=base64Encode(s);result=null})">
      <input v-model="message">
      <input type="submit" value="Sign Message">
    </form>

    <p v-if="signed">
      Your signature: {{ signed }}
    </p>

    <form v-if="signed" @submit.prevent="
      am.verify(base64Decode(signed), encoder.encode(message), actorID).then(r=>result=r)">
      <input type="submit" value="Verify Signed Message">
      <span v-if="result!==null">
        {{ result }}
      </span>
    </form>

    <hr>
    Who do you want to send and receive private messages from? <input v-model="theirURI">

    <form @submit.prevent="am.encryptPrivateMessage(encoder.encode(plaintextIn),theirURI).then(c=>ciphertextOut=base64Encode(c))">
      <input v-model="plaintextIn">
      <input type="submit" value="Encrypt Message to Recipient">
    </form>

    <p v-if="ciphertextOut">
      Ciphertext: {{ ciphertextOut }}
    </p>

    <form @submit.prevent="am.decryptPrivateMessage(base64Decode(ciphertextIn),theirURI).then(p=>plaintextOut=decoder.decode(p))">
      <input v-model="ciphertextIn">
      <input type="submit" value="Decrypt Message from Recipient">
    </form>

    <p v-if="plaintextOut">
      Plaintext: {{ plaintextOut }}
    </p>

    <hr>

    <p>
      <button @click="generateNonce()">
        Generate Nonce
      </button>
      Nonce: {{ base64Encode(nonce) }}
    </p>

    <p>
      <button @click="am.oneTimePublicKey(nonce).then(pk=>oneTimePublicKey=base64Encode(pk))">
        Generate One Time Public Key from Nonce
      </button>
    </p>

    <p v-if="oneTimePublicKey">
      One Time Public Key: {{ oneTimePublicKey }}
    </p>

    <form @submit.prevent="am.oneTimeSignature(encoder.encode(oneTimeMessage),nonce).then(s=>{oneTimeSignature=base64Encode(s);oneTimeResult=null})">
      <input v-model="oneTimeMessage">
      <input type="submit" value="Sign Message with One Time Signature From Nonce">
    </form>

    <p v-if="oneTimeSignature">
      One Time Signature: {{  oneTimeSignature }}
    </p>

    <form v-if="oneTimePublicKey&&oneTimeSignature" @submit.prevent="
      am.verify(base64Decode(oneTimeSignature), encoder.encode(oneTimeMessage), base64Decode(oneTimePublicKey)).then(r=>oneTimeResult=r)">
      <input type="submit" value="Verify Signed Message">
      <span v-if="oneTimeResult!==null">
        {{ oneTimeResult }}
      </span>
    </form>

  </template>

</template>