<template>
    <template v-if="isLoggedIn">
        <header>
            <h1>
                <RouterLink :to="{ name: 'home' }"> {{ host }} </RouterLink>
            </h1>
            <nav>
                <ul>
                    <li>
                        <RouterLink :to="{ name: 'handles' }">
                            Handles
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink :to="{ name: 'actors' }">
                            Actors
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink :to="{ name: 'storage' }">
                            Storage Buckets
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink :to="{ name: 'inboxes' }">
                            Inboxes
                        </RouterLink>
                    </li>
                    <li><Logout /></li>
                </ul>
            </nav>
        </header>

        <main>
            <RouterView />
        </main>
    </template>
    <template v-else-if="isLoggedIn === false">
        <LoginGuard />
    </template>
    <template v-else>Loading...</template>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import { isLoggedIn } from "./globals";
import LoginGuard from "./auth/LoginGuard.vue";
import Logout from "./auth/Logout.vue";

const host = window.location.host;
</script>

<style>
nav li a.router-link-exact-active {
    text-decoration: underline;
}
</style>
