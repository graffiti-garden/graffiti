<template>
    <template v-if="isLoggedIn">
        <header>
            <h1>Graffiti</h1>
            <nav>
                <ul>
                    <li><RouterLink to="/">Home</RouterLink></li>
                    <li><RouterLink to="/actors">Actors</RouterLink></li>
                    <li><RouterLink to="/storage">Storage</RouterLink></li>
                    <li><RouterLink to="/indexers">Indexers</RouterLink></li>
                    <li>
                        <Logout />
                    </li>
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
</script>
