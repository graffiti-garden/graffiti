<template>
    <section>
        <header>
            <h2>New Graffiti Account</h2>
        </header>
        <form @submit.prevent="handleSubmit">
            <button v-focus type="submit" :disabled="registering">
                {{ registering ? "Registering..." : "Register with Passkey" }}
            </button>
        </form>
    </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
    startRegistration,
    type RegistrationResponseJSON,
} from "@simplewebauthn/browser";

const registering = ref(false);

async function handleSubmit() {
    registering.value = true;

    // Register a passkey
    const challengeResponse = await fetch("/api/webauthn/register/challenge");
    if (!challengeResponse.ok) {
        const { error } = await challengeResponse.json();
        alert(`Failed to register passkey. ${error}`);
        registering.value = false;
        return;
    }
    const optionsJSON = await challengeResponse.json();

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
    const verificationResp = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationResponse),
    });
    if (!verificationResp.ok) {
        const { error } = await verificationResp.json();
        alert(`Failed to register passkey. ${error}`);
        registering.value = false;
        return;
    }

    // TODO: Navigate to a new page
    alert("Registered!");
    registering.value = false;
}
</script>
