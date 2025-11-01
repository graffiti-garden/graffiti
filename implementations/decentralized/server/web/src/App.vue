<template>
    <main
    </main>
    <template v-if="isLoggedIn">
        <header>
            <h1>Graffiti</h1>
        </header>

        <main>
            <p>Logged in!</p>
            <Logout v-model:isLoggedIn="isLoggedIn"/>
        </main>
    </template>
    <template v-else-if="isLoggedIn === false">
        <header>
            <h1>Welcome to Graffiti</h1>
        </header>

        <main>
            <Login v-model:isLoggedIn="isLoggedIn"/>
            <Register v-model:isLoggedIn="isLoggedIn"/>
        </main>
    </template>
    <template v-else>
        Loading...
    </template>
</template>

<script setup lang="ts">
import Register from "./Register.vue";
import Login from "./Login.vue";
import Logout from "./Logout.vue";

import { ref } from "vue";

const isLoggedIn = ref<boolean | undefined>(undefined);
fetch("/api/webauthn/logged-in").then(
    (result) => (isLoggedIn.value = result.ok),
);
</script>
