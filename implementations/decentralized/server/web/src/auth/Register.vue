<template>
    <button @click="handleRegister" :disabled="registering">
        {{ registering ? "Creating Account…" : "Create Account" }}
        <StatusIcon v-if="registering" status="loading" />
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
    startRegistration,
    type RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { isLoggedIn, fetchFromSelf } from "../globals";
import StatusIcon from "../utils/StatusIcon.vue";

const registering = ref(false);

async function handleRegister() {
    registering.value = true;

    let optionsJSON: any;
    try {
        optionsJSON = await fetchFromSelf("/app/webauthn/register/challenge");
    } catch (error: any) {
        alert(`Failed to register passkey. ${error.message}`);
        registering.value = false;
        return;
    }

    let registrationResponse: RegistrationResponseJSON;
    try {
        registrationResponse = await startRegistration({ optionsJSON });
    } catch (error) {
        console.log("User cancelled the registration process?");
        console.error(error);
        registering.value = false;
        return;
    }

    // Verify the passkey registration
    try {
        await fetchFromSelf("/app/webauthn/register/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(registrationResponse),
        });
    } catch (error: any) {
        alert(`Failed to register passkey. ${error.message}`);
        registering.value = false;
        return;
    }

    registering.value = false;
    isLoggedIn.value = true;
}
</script>
