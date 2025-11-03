<template>
    <main
    </main>
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
    <template v-else>
        Loading...
    </template>
</template>

<script setup lang="ts">
import Register from "./Register.vue";
import Login from "./Login.vue";
import Logout from "./Logout.vue";
import { fetchFromAPI, isLoggedIn } from "./globals";

function checkLoggedInStatus() {
  fetchFromAPI("webauthn/logged-in")
    .then(()=> { isLoggedIn.value = true })
    .catch(() => {
      // Any 401 will automatically set isLoggedIn to false,
      // but if its a different error, retry after 1 second
      if (isLoggedIn.value === undefined) {
        setTimeout(() => {
          checkLoggedInStatus();
        }, 1000);
      }
    });
}
checkLoggedInStatus();
</script>
