<template>
    <template v-if="isLoggedIn">
        <header>
            <h1>Graffiti</h1>
        </header>

        <main>
            <RouterView />
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
import { isLoggedIn } from "./globals";
import { RouterView } from "vue-router";
</script>
