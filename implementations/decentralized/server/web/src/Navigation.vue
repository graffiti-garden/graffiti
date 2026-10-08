<template>
    <template v-if="isLoggedIn || $route.name === 'create'">
        <header>
            <h1>
                <RouterLink :to="{ name: 'home' }"> {{ host }} </RouterLink>
            </h1>

            <AccountSwitcher v-if="$route.name !== 'create'" />
        </header>

        <main>
            <RouterView :key="$route.name === 'create' ? 'create' : selectedAccount" />
        </main>
    </template>
    <template v-else-if="isLoggedIn === false">
        <LoginGuard />
    </template>
    <template v-else>
        <dialog open>
            <header>
                <h1>Loading {{ host }}...</h1>
            </header>
            <main>
                <StatusIcon status="loading" />
            </main>
        </dialog>
    </template>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import { isLoggedIn, selectedAccount } from "./globals";
import LoginGuard from "./auth/LoginGuard.vue";
import AccountSwitcher from "./auth/AccountSwitcher.vue";
import StatusIcon from "./utils/StatusIcon.vue";
import "./auth/floating-panel.css";

const host = window.location.host;
</script>
