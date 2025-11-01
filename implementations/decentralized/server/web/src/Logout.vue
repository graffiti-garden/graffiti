<template>
    <button @click="handleLogout" :disabled="loggingOut">
        {{ loggingOut ? "Logging out..." : "Log Out" }}
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";

const loggingOut = ref(false);

const isLoggedIn = defineModel<boolean | undefined>("isLoggedIn", {
    required: true,
});

async function handleLogout() {
    loggingOut.value = true;
    const result = await fetch("/api/webauthn/logout", { method: "POST" });
    if (!result.ok) {
        const { error } = await result.json();
        alert(`Error logging out. ${error}`);
    } else {
        isLoggedIn.value = false;
    }
    loggingOut.value = false;
}
</script>
