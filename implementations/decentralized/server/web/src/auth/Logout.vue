<template>
    <button :disabled="loggingOut" @click="handleLogout">
        {{ loggingOut ? "Logging out…" : "Log Out" }}
        <StatusIcon v-if="loggingOut" status="loading" />
    </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { isLoggedIn, fetchFromSelf } from "../globals";
import StatusIcon from "../utils/StatusIcon.vue";

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
