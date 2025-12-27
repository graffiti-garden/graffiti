<template>
    <button @click="handleLogout" :disabled="loggingOut">
        {{ loggingOut ? "Logging out..." : "Log Out" }}
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { isLoggedIn, fetchFromSelf } from "../globals";

const loggingOut = ref(false);

async function handleLogout() {
    loggingOut.value = true;

    try {
        await fetchFromSelf("/app/webauthn/logout", {
            method: "POST",
        });
        isLoggedIn.value = false;
    } catch (error: any) {
        alert(`Error logging out. ${error.message}`);
    }

    loggingOut.value = false;
}
</script>
