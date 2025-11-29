<template>
    <template v-if="isLoggedIn">
        <header>
            <h1>Graffiti</h1>
        </header>

        <main>
            <p>Logged in!</p>
            <Logout />
        </main>
    </template>
    <template v-else-if="isLoggedIn === false">
        <header>
            <h1>Welcome to Graffiti</h1>
        </header>

        <main>
            <Login />
            <Register />
        </main>
    </template>
    <template v-else>Loading...</template>
</template>

<script setup lang="ts">
import Register from "./auth/Register.vue";
import Login from "./auth/Login.vue";
import Logout from "./auth/Logout.vue";
import { isLoggedIn } from "./globals";
</script>
