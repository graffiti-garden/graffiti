<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import ActorManager, { base64Encode, base64Decode } from '../index';

const actorID: Ref<null | string> = ref(null)

const nonce: Ref<Uint8Array | undefined> = ref(undefined)
const publicKey: Ref<string> = ref('')
async function getPublicKey() {
    publicKey.value = base64Encode(await am.getPublicKey(nonce.value))
}

async function noNoncense() {
    nonce.value = undefined
    await getPublicKey()
}
async function generateNonce() {
    const value = new Uint8Array(24)
    crypto.getRandomValues(value)
    nonce.value = value
    await getPublicKey()
}

const am = new ActorManager({
    async onChosenActor(actorURI: string | null) {
        actorID.value = actorURI
        await noNoncense()
    }
})


const encoder = new TextEncoder()
const decoder = new TextDecoder()

const message: Ref<string> = ref('')
const signed: Ref<string> = ref('')
const result: Ref<null | boolean> = ref(null)

const theirURI: Ref<string> = ref('')
const plaintextIn: Ref<string> = ref('')
const ciphertextOut: Ref<string> = ref('')
const ciphertextIn: Ref<string> = ref('')
const plaintextOut: Ref<string> = ref('')
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

        Would you like to use your root identity or a one-time identity?

        <button @click="noNoncense">
            Use root identity
        </button>
        <button @click="generateNonce">
            Derive one-time identity
        </button>

        <p>
            Your public key is: {{ publicKey }}
        </p>

        <hr>

        <form @submit.prevent="am.sign(encoder.encode(message), nonce).then(s => { signed = base64Encode(s); result = null })">
            <input v-model="message">
            <input type="submit" value="Sign Message">
        </form>

        <p v-if="signed">
            Your signature: {{ signed }}
        </p>

        <form v-if="signed" @submit.prevent="
            am.verify(base64Decode(signed), encoder.encode(message), base64Decode(publicKey)).then(r => result = r)">
            <input type="submit" value="Verify Signed Message">
            <span v-if="result !== null">
                {{ result }}
            </span>
        </form>

        <hr>


        <hr>
        Who do you want to send and receive private messages from? <input v-model="theirURI">

        <form
            @submit.prevent="am.encrypt(encoder.encode(plaintextIn), theirURI, nonce).then(c => ciphertextOut = base64Encode(c))">
            <input v-model="plaintextIn">
            <input type="submit" value="Encrypt Message to Recipient">
        </form>

        <p v-if="ciphertextOut">
            Ciphertext: {{ ciphertextOut }}
        </p>

        <form
            @submit.prevent="am.decrypt(base64Decode(ciphertextIn), theirURI, nonce).then(p => plaintextOut = decoder.decode(p)).catch(() => plaintextOut = 'error decoding message')">
            <input v-model="ciphertextIn">
            <input type="submit" value="Decrypt Message from Recipient">
        </form>

        <p v-if="plaintextOut">
            Plaintext: {{ plaintextOut }}
        </p>

    </template>
</template>
