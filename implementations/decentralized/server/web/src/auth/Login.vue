<template>
    <button @click="handleLogin" :disabled="loggingIn">
        {{ loggingIn ? "Logging in…" : "Log In" }}
        <StatusIcon v-if="loggingIn" status="loading" />
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
    startAuthentication,
    type AuthenticationResponseJSON,
} from "@simplewebauthn/browser";
import { fetchFromSelf, refreshAccounts } from "../globals";
import StatusIcon from "../utils/StatusIcon.vue";

const emit = defineEmits<{ (e: "success"): void }>();
const loggingIn = ref(false);

async function handleLogin() {
    loggingIn.value = true;

    let optionsJSON: any;
    try {
        optionsJSON = await fetchFromSelf(
            "/app/webauthn/authenticate/challenge",
        );
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
        const result = await fetchFromSelf("/app/webauthn/authenticate/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authenticationResponse),
        });
        await refreshAccounts(result.accountId);
        emit("success");
    } catch (error: any) {
        alert(`Failed to log in. ${error.message}`);
        loggingIn.value = false;
        return;
    }

    loggingIn.value = false;
}
</script>
