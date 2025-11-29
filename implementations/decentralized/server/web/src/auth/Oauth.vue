<template>
    An app at {{ redirectUriObject?.hostname }} is requesting access to your
    Graffiti data.

    <template v-if="isLoggedIn === false">
        <Register />
        <Login />
    </template>
    <template v-else-if="isLoggedIn === true">
        <button @click="handleApprove">Approve</button>
        <button @click="handleDeny">Deny</button>
        <LogOut />
    </template>
    <template v-else> Loading... </template>
</template>

<script setup lang="ts">
import Register from "./Register.vue";
import Login from "./Login.vue";
import LogOut from "./Logout.vue";
import { isLoggedIn } from "../globals";
import { useRouter } from "vue-router";

// Extract the redirectUri from the search params
const redirectUri = new URLSearchParams(window.location.search).get(
    "redirect_uri",
);

// If there is no redirect URI, redirect to the home page
const router = useRouter();

let redirectUriObject: URL | undefined;
if (redirectUri === null) {
    router.push("/");
} else {
    try {
        redirectUriObject = new URL(redirectUri);
    } catch (error) {
        console.error("Invalid redirect URI");
        console.error(error);
        router.push("/");
    }
}

// Also get the state
const state = new URLSearchParams(window.location.search).get("state") ?? "";

function handleApprove() {
    // On approval, redirect to the authorize endpoint
    if (!redirectUriObject) return router.push("/");
    const url = new URL("/api/oauth/authorize", window.location.origin);
    url.searchParams.set("redirect_uri", redirectUriObject.toString());
    url.searchParams.set("state", state);
    window.location.href = url.toString();
}

function handleDeny() {
    // On rejection, redirect back with an error
    if (!redirectUriObject) return router.push("/");
    redirectUriObject.searchParams.set("error", "access_denied");
    redirectUriObject.searchParams.set(
        "error_description",
        "The user denied the request",
    );
    window.location.href = redirectUriObject.toString();
}
</script>
