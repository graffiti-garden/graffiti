<template>
    <button
        :disabled="loggingOut"
        :aria-label="defaultLabel"
        @click="handleLogout"
    >
        {{ loggingOut ? "Logging out…" : (label ?? defaultLabel) }}
        <StatusIcon v-if="loggingOut" status="loading" />
    </button>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { accountLabel, accounts, currentAccount, fetchFromSelf, refreshAccounts } from "../globals";
import StatusIcon from "../utils/StatusIcon.vue";

const props = defineProps<{ all?: boolean; label?: string }>();
const loggingOut = ref(false);
const defaultLabel = computed(() =>
    props.all ? "Log Out of All Accounts" : `Log Out of ${accountLabel(currentAccount.value)}`,
);

async function handleLogout() {
    loggingOut.value = true;

    try {
        const targetAccounts = props.all
            ? (accounts.value ?? [])
            : currentAccount.value
              ? [currentAccount.value]
              : [];
        for (const account of targetAccounts) {
            await fetchFromSelf("/app/webauthn/logout", {
                method: "POST",
                headers: { "X-Graffiti-Account": String(account.id) },
            });
        }
        await refreshAccounts();
    } catch (error: any) {
        alert(`Error logging out. ${error.message}`);
    }

    loggingOut.value = false;
}
</script>
