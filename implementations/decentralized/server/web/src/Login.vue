<template>
    <button @click="handleLogin" :disabled="loggingIn">
        {{ loggingIn ? "Logging in..." : "Log In" }}
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
    startAuthentication,
    type AuthenticationResponseJSON,
} from "@simplewebauthn/browser";

const loggingIn = ref(false);

const isLoggedIn = defineModel<boolean | undefined>("isLoggedIn", {
    required: true,
});

async function handleLogin() {
    loggingIn.value = true;

    const challengeResponse = await fetch(
        "/api/webauthn/authenticate/challenge",
    ).catch(({ message: m }) => ({ ok: false, text: () => m }) as const);
    if (!challengeResponse.ok) {
        const error = await challengeResponse.text();
        alert(`Failed to log in. ${error}`);
        loggingIn.value = false;
        return;
    }
    const optionsJSON = await challengeResponse.json();

    let authenticationResponse: AuthenticationResponseJSON;
    try {
        authenticationResponse = await startAuthentication({ optionsJSON });
    } catch (error) {
        console.log("User cancelled the authentication process?");
        console.error(error);
        loggingIn.value = false;
        return;
    }

    const verificationResponse = await fetch(
        "/api/webauthn/authenticate/verify",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authenticationResponse),
        },
    ).catch(({ message: m }) => ({ ok: false, text: () => m }) as const);
    if (!verificationResponse.ok) {
        const error = await verificationResponse.text();
        alert(`Failed to log in. ${error}`);
        loggingIn.value = false;
        return;
    }

    loggingIn.value = false;
    isLoggedIn.value = true;
}
</script>
