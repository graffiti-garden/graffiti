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
import { isLoggedIn, fetchFromAPI } from "./utils";

const loggingIn = ref(false);

async function handleLogin() {
    loggingIn.value = true;

    let optionsJSON: any;
    try {
        optionsJSON = await fetchFromAPI("webauthn/authenticate/challenge");
    } catch (error: any) {
        alert(`Failed to log in. ${error.message}`);
        loggingIn.value = false;
        return;
    }

    let authenticationResponse: AuthenticationResponseJSON;
    try {
        authenticationResponse = await startAuthentication({ optionsJSON });
    } catch (error) {
        console.error("User cancelled the authentication process?");
        console.error(error);
        loggingIn.value = false;
        return;
    }

    try {
        await fetchFromAPI("webauthn/authenticate/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authenticationResponse),
        });
    } catch (error: any) {
        alert(`Failed to log in. ${error.message}`);
        loggingIn.value = false;
        return;
    }

    loggingIn.value = false;
    isLoggedIn.value = true;
}
</script>
