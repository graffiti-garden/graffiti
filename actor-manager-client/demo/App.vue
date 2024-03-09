<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Ref } from 'vue'
import ActorManager, { base64Encode, base64Decode } from '../index';

const actorID: Ref<null | string> = ref(null)

const nonce: Ref<Uint8Array | undefined> = ref(undefined)
const publicKey: Ref<string> = ref('')
async function getPublicKey() {
    const publicKeyBytes = nonce.value ? await am.getPublicKey(nonce.value) : am.chosenActorPublicKey
    if (publicKeyBytes) {
        publicKey.value = base64Encode(publicKeyBytes)
    } else {
        publicKey.value = ''
    }
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

const iframecontainer = ref(null)
function openIframe() {
    iframecontainer.value.style.display = 'block'
}

const am = new ActorManager({
    async onChosenActor(actorURI: string | null) {
        actorID.value = actorURI
        await noNoncense()
    },
    onUICancel() {
        iframecontainer.value.style.display = 'none'
    }
})

onMounted(() => {
    iframecontainer.value.appendChild(am.iframe)
    iframecontainer.value.style.display = 'none'
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
const plaintextInSelf: Ref<string> = ref('')
const ciphertextOutSelf: Ref<string> = ref('')
const ciphertextInSelf: Ref<string> = ref('')
const plaintextOutSelf: Ref<string> = ref('')
</script>

<template>
    <button @click="openIframe">
        Open Actor Manager
    </button>
    <div ref="iframecontainer"></div>

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

        <form
            @submit.prevent="am.sign(encoder.encode(message), nonce).then(s => { signed = base64Encode(s); result = null })">
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

        <hr>
        Encrypt and decrypt a message to yourself:
        <form
            @submit.prevent="am.encrypt(encoder.encode(plaintextInSelf), undefined, nonce).then(c => ciphertextOutSelf = base64Encode(c))">
            <input v-model="plaintextInSelf">
            <input type="submit" value="Encrypt Message to Self">
        </form>

        <p v-if="ciphertextOutSelf">
            Ciphertext: {{ ciphertextOutSelf }}
        </p>

        <form
            @submit.prevent="am.decrypt(base64Decode(ciphertextInSelf), undefined, nonce).then(p => plaintextOutSelf = decoder.decode(p)).catch(() => plaintextOutSelf = 'error decoding message')">
            <input v-model="ciphertextInSelf">
            <input type="submit" value="Decrypt Message from Self">
        </form>

        <p v-if="plaintextOutSelf">
            Plaintext: {{ plaintextOutSelf }}
        </p>

    </template>
</template>

<style>
iframe {
    width: 100%;
    height: 500px;
}
</style>
