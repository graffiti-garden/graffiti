<template>
    <dialog open>
        <header>
            <h1>Welcome to {{ host }}</h1>
            <h2>
                A
                <a href="https://graffiti.garden" target="_blank">Graffiti</a>
                Provider
            </h2>
        </header>

        <main>
            <Register />
            <Login class="secondary" />
        </main>
    </dialog>
</template>

<script setup lang="ts">
import Register from "./Register.vue";
import Login from "./Login.vue";
import "./floating-panel.css";

const host = window.location.host;
</script>
