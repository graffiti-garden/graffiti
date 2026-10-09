<template>
    <dialog open>
        <header>
            <a :href="returnToApp?.toString() ?? '/'">← Back</a>
            <h1>Forgot your handle?</h1>
        </header>

        <main v-if="returnToApp">
            <Login class="secondary" @success="returnActor" />
        </main>
        <main v-else>
            <p>Invalid application return address.</p>
        </main>
    </dialog>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { fetchFromSelf } from "../globals";
import Login from "./Login.vue";
import "./floating-panel.css";

const redirectUri = useRoute().query.redirect_uri;
let returnToApp: URL | undefined;
if (typeof redirectUri === "string") {
    try {
        const url = new URL(redirectUri);
        if (url.protocol === "https:" || url.protocol === "http:") {
            returnToApp = url;
        }
    } catch {}
}

async function returnActor(accountId: number) {
    if (!returnToApp) return;
    try {
        const { actors } = await fetchFromSelf("/app/actors/list", {
            headers: { "X-Graffiti-Account": String(accountId) },
        }) as { actors: Array<{ did: string }> };
        const actor = actors[0]?.did;
        if (!actor) throw new Error("This account does not have an actor.");
        const url = new URL(returnToApp);
        // The client handles this actor callback as it does after account creation.
        url.searchParams.set("actor", encodeURIComponent(actor));
        window.location.assign(url.toString());
    } catch (error) {
        alert(`Failed to continue. ${error instanceof Error ? error.message : String(error)}`);
    }
}
</script>

<style scoped>
header > a {
    align-self: flex-start;
}
</style>
