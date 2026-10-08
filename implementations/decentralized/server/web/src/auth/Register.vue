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
import { fetchFromSelf, refreshAccounts } from "../globals";
import StatusIcon from "../utils/StatusIcon.vue";

const emit = defineEmits<{ (e: "success"): void }>();
const registering = ref(false);

// Registration creates a new account even when another account is selected.
// Its requests must use the temporary session, not that account's session.
const fetchForNewAccount = (path: string, options?: RequestInit) =>
    fetchFromSelf(path, options, false);

async function handleRegister() {
    registering.value = true;

    let optionsJSON: any;
    try {
        optionsJSON = await fetchForNewAccount("/app/webauthn/register/challenge");
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
        const result = await fetchForNewAccount("/app/webauthn/register/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(registrationResponse),
        });
        await refreshAccounts(result.accountId);
        emit("success");
    } catch (error: any) {
        alert(`Failed to register passkey. ${error.message}`);
        registering.value = false;
        return;
    }

    registering.value = false;
}
</script>
