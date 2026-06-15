<script setup lang="ts">
import { ref } from "vue";
import {
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";

const graffiti = useGraffiti();
const session = useGraffitiSession();
const loggingIn = ref(false);
const loggingOut = ref(false);

async function login() {
    if (loggingIn.value) return;
    loggingIn.value = true;
    try {
        await graffiti.login();
    } finally {
        loggingIn.value = false;
    }
}

async function logout() {
    if (!session.value || loggingOut.value) return;
    loggingOut.value = true;
    try {
        await graffiti.logout(session.value);
    } finally {
        loggingOut.value = false;
    }
}
</script>

<template>
    <template v-if="!session">
        <dialog>
            <h1>
                <RouterLink to="/"> ✨ glitter ✨ </RouterLink>
            </h1>
            <h2>Made with <a href="https://graffiti.garden">Graffiti</a></h2>
            <p v-if="session === undefined">Loading...</p>
            <button v-else @click="login" :disabled="loggingIn">
                {{ loggingIn ? "logging in..." : "log in" }}
            </button>
        </dialog>
    </template>
    <template v-else>
        <header>
            <menu>
                <li>
                    <RouterLink to="/"> feed </RouterLink>
                </li>
                <li>
                    <RouterLink
                        :to="`/profile/${encodeURIComponent(session.actor)}`"
                    >
                        my profile
                    </RouterLink>
                </li>
                <li>
                    <RouterLink to="/following"> following </RouterLink>
                </li>
                <li>
                    <RouterLink to="/directory"> directory </RouterLink>
                </li>
                <li>
                    <button @click="logout" :disabled="loggingOut">
                        {{ loggingOut ? "logging out..." : "log out" }}
                    </button>
                </li>
            </menu>
        </header>

        <main class="glitter">
            <RouterView />
            <footer>
                made of
                <a href="https://graffiti.garden" target="_blank">graffiti</a>
            </footer>
        </main>
    </template>
</template>

<style scoped>
li button {
    color: inherit;
    font-size: inherit;
    padding: 0.5em;
    border: none;
    text-decoration: none;
}

li button:hover {
    background: var(--dark-blue) !important;
}

h2 {
    color: white;
}
</style>
