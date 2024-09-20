<script setup lang="ts">
import { ref } from "vue";
import { useGraffitiSession } from "./session";
import type { Session as SolidSession } from "@inrupt/solid-client-authn-browser";

const props = withDefaults(
    defineProps<{
        oidcIssuerOptions?: string[];
        clientName: string;
        redirectUrl?: string;
        solidSession?: SolidSession;
    }>(),
    {
        oidcIssuerOptions: () => [
            "https://solid.theias.place",
            "https://login.inrupt.com",
            "https://solidcommunity.net",
            "https://solidweb.org",
            "https://solidweb.me",
            "https://teamid.live",
            "https://solid.redpencil.io",
            "https://idp.use.id",
            "https://inrupt.net",
        ],
        redirectUrl: () => window.origin,
    },
);

// Dynamic import so the (unnecessarily large)
// solid-client-authn-browser library is only
// loaded when this component is used.
const session = useGraffitiSession();
async function solidSession() {
    return (
        props.solidSession ??
        (await import("@inrupt/solid-client-authn-browser")).getDefaultSession()
    );
}

function focusInput(event: MouseEvent) {
    const input = event.target as HTMLInputElement;
    input.focus();
}

const selectedIssuer = ref<string | undefined>(undefined);
const loggingIn = ref(false);
async function login() {
    const oidcIssuer = selectedIssuer.value;
    if (!oidcIssuer) {
        alert("You must select an identity issuer to login");
        return;
    }
    loggingIn.value = true;
    await (
        await solidSession()
    ).login({
        oidcIssuer,
        redirectUrl: props.redirectUrl,
        clientName: props.clientName,
    });
    loggingIn.value = false;
}

async function logout() {
    await (await solidSession()).logout();
}
</script>
<template>
    <form
        class="graffiti-session-manager"
        @submit.prevent="session.webId ? logout() : login()"
    >
        <template v-if="!session.webId">
            <label for="oidc-choice">Choose an Identity Provider:</label>
            <input
                list="oidc-issuers"
                id="oidc-choice"
                name="oidc-choice"
                v-model="selectedIssuer"
                @mouseover="focusInput"
                placeholder="https://example.com"
            />

            <datalist id="oidc-issuers">
                <option
                    v-for="issuer in oidcIssuerOptions"
                    :value="issuer"
                ></option>
            </datalist>

            <input
                type="submit"
                v-if="!loggingIn"
                value="Log In to Identity Provider"
            />
            <input
                type="submit"
                v-else
                disabled
                value="Redirecting to Identity Provider..."
            />
        </template>
        <template v-else>
            <label for="webid">Your WebId is:</label>
            <input id="webid" type="text" readonly :value="session.webId" />
            <input type="submit" value="Log Out of Identity Provider" />
        </template>
    </form>
</template>

<style>
.graffiti-session-manager {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    justify-content: stretch;

    label {
        display: block;
        font-size: 80%;
    }

    input {
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
        font-size: inherit;
        font-family: inherit;
        padding: 0.3rem;
    }

    input[type="submit"] {
        cursor: pointer;
    }
}
</style>
