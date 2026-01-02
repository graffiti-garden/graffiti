<template>
    <template v-if="isLoggedIn">
        <header>
            <h1>
                {{ host }}: A
                <a href="https://graffiti.garden" target="_blank">Graffiti</a>
                Provider
            </h1>
            <nav>
                <ul>
                    <li>
                        <RouterLink :to="{ name: 'home' }"> Home </RouterLink>
                    </li>
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
                            Storage
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink :to="{ name: 'inboxes' }">
                            Indexers
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
