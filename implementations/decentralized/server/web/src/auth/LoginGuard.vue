<template>
    <dialog open>
        <header>
            <button
                v-if="addingAccount"
                type="button"
                class="back"
                @click="router.back()"
            >
                ← Back
            </button>
            <h1>Welcome to {{ host }}</h1>
            <h2>
                A
                <a href="https://graffiti.garden" target="_blank">Graffiti</a>
                Provider
            </h2>
        </header>

        <main>
            <Register @success="leaveIfAddingAccount" />
            <Login class="secondary" @success="leaveIfAddingAccount" />
        </main>
    </dialog>
</template>

<script setup lang="ts">
import Register from "./Register.vue";
import Login from "./Login.vue";
import { useRoute, useRouter } from "vue-router";
import "./floating-panel.css";

const host = window.location.host;
const router = useRouter();
const addingAccount = useRoute().name === "add-account";

function leaveIfAddingAccount() {
    if (addingAccount) router.replace({ name: "home" });
}
</script>

<style scoped>
.back {
    align-self: flex-start;
    width: auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--pico-primary);
    text-decoration: underline;
}
</style>
