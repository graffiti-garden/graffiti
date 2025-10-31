<template>
    <section>
        <header>
            <h2>Choose a Username</h2>
            <p>
                This username will not be visible to others, it is just for
                logging in.
            </p>
        </header>
        <form @submit.prevent="handleSubmit">
            <div>
                <label for="username"> Username </label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    required
                    autocomplete="username"
                    autocapitalize="none"
                    autocorrect="off"
                    inputmode="text"
                    v-focus
                    v-model.trim="username"
                />
            </div>
            <output v-if="username" for="username">
                <template v-if="available === false"
                    >Sorry, that username is taken.</template
                >
                <template v-else-if="available === true"
                    >That username is available!</template
                >
                <template v-else>Checking availability…</template>
            </output>
            <button
                type="submit"
                :disabled="!username.trim().length || !available || registering"
            >
                {{ registering ? "Registering..." : "Register with Passkey" }}
            </button>
        </form>
    </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import {
    startRegistration,
    type RegistrationResponseJSON,
} from "@simplewebauthn/browser";

const username = ref("");
const registering = ref(false);
const available = ref<boolean | undefined>(undefined);

watch(username, async (newUsername, _, onCleanup) => {
    const controller = new AbortController();

    const trimmed = newUsername.trim();
    if (trimmed.length === 0) {
        available.value = undefined;
        return;
    }

    // Show loading indicator
    available.value = undefined;

    // Debounce for 0.5s before checking availability
    // to not spam the server while the user is typing
    const timeout = setTimeout(async () => {
        try {
            const response = await fetch(
                `/api/username/available/${encodeURIComponent(trimmed)}`,
                {
                    signal: controller.signal,
                },
            );

            if (!response.ok) {
                available.value = false;
                return;
            }

            const json = await response.json();
            available.value = json.available;
        } catch (error) {
            if ((error as any).name === "AbortError") return;
            available.value = false;
        }
    }, 500);

    onCleanup(() => {
        controller.abort();
        clearTimeout(timeout);
    });
});

async function handleSubmit() {
    const trimmed = username.value.trim();
    if (!trimmed.length) return;
    registering.value = true;

    // Register the username
    const userResponse = await fetch(
        `/api/username/register?username=${encodeURIComponent(trimmed)}`,
        {
            method: "POST",
        },
    );

    if (!userResponse.ok) {
        const { error } = await userResponse.json();
        alert(`Failed to register username. ${error}`);
        registering.value = false;
        return;
    }

    // Register a passkey with the username
    const optionsResponse = await fetch("/api/webauthn/register/challenge");
    if (!optionsResponse.ok) {
        const { error } = await optionsResponse.json();
        alert(`Failed to register passkey. ${error}`);
        registering.value = false;
        return;
    }
    const optionsJSON = await optionsResponse.json();

    let attResp: RegistrationResponseJSON;
    try {
        attResp = await startRegistration({ optionsJSON });
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
        body: JSON.stringify(attResp),
    });
    if (!verificationResp.ok) {
        const { error } = await verificationResp.json();
        alert(`Failed to register passkey. ${error}`);
        registering.value = false;
        return;
    }

    // TODO: Navigate to a new page
    alert("Registered!");
}
</script>
