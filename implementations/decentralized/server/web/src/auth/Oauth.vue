<template>
    <dialog open>
        <header>
            <h1>
                Authorize
                <code>{{ redirectUriObject?.hostname }}</code>
                to access your data?
            </h1>
        </header>

        <main>
            <template v-if="isLoggedIn === false">
                <Login />
            </template>
            <template v-else-if="isLoggedIn === true">
                <p>
                    <code>{{ redirectUriObject?.hostname }}</code>
                    is requesting access your Graffiti data.
                </p>
                <button @click="handleApprove">Approve</button>
                <button class="secondary" @click="handleDeny">Deny</button>
                <RouterLink to="/" target="_blank">Go to account</RouterLink>
            </template>
            <template v-else> Loading... </template>
        </main>
    </dialog>
</template>

<script setup lang="ts">
import Login from "./Login.vue";
import LogOut from "./Logout.vue";
import { isLoggedIn } from "../globals";
import { useRouter } from "vue-router";
import "./floating-panel.css";

// TODO:
// work out if this is my storage/indexer/etc.
// if not ask to switch accounts
// - Extract the requested services from the scope search parameter
// - List services of logged in user
// - If they are all the user's services, display the correct names for them
// - Otherwise, ask them to switch accounts

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
    const url = new URL("/app/oauth/authorize", window.location.origin);
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
