<script setup lang="ts">
import { ref, type PropType } from "vue";
import {
    useGraffitiSession,
    webIdLogin,
    webIdLogout,
    setHomePod,
    unsetHomePod,
} from "./session";

defineProps({
    oidcIssuers: {
        type: Array as PropType<string[]>,
        default: [
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
    },
    homePods: {
        type: Array as PropType<string[]>,
        default: ["https://pod.graffiti.garden"],
    },
    clientName: {
        type: String,
        required: true,
    },
    redirectPath: {
        type: String,
    },
});

const session = useGraffitiSession();
const selectedIssuer = ref("");
const selectedHomePod = ref("");

function focusInput(event: MouseEvent) {
    const input = event.target as HTMLInputElement;
    input.focus();
}
</script>
<template>
    <div class="graffiti-session-manager">
        <template v-if="session.isInitializing">
            <span>Loading Graffiti...</span>
        </template>
        <template v-else>
            <form
                v-if="!session.webId"
                @submit.prevent="
                    webIdLogin(selectedIssuer, clientName, redirectPath)
                "
            >
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
                        v-for="issuer in oidcIssuers"
                        :value="issuer"
                    ></option>
                </datalist>

                <input type="submit" value="Log In to Identity Provider" />
            </form>
            <form v-else @submit.prevent="webIdLogout">
                <label for="webid">Your WebId is:</label>
                <input id="webid" type="text" readonly :value="session.webId" />
                <input type="submit" value="Log Out of Identity Provider" />
            </form>
            <form
                v-if="!session.homePod"
                @submit.prevent="setHomePod(selectedHomePod)"
            >
                <label for="home-pod-choice">Choose a Home Pod:</label>
                <input
                    list="home-pods"
                    id="home-pod-choice"
                    name="home-pod-choice"
                    v-model="selectedHomePod"
                    @mouseover="focusInput"
                    placeholder="https://example.com"
                />

                <datalist id="home-pods">
                    <option v-for="pod in homePods" :value="pod"></option>
                </datalist>
                <input type="submit" value="Set Home Pod" />
            </form>
            <form v-else @submit.prevent="unsetHomePod">
                <label for="home-pod">Your Home Pod is:</label>
                <input
                    id="home-pod"
                    type="text"
                    readonly
                    :value="session.homePod"
                />
                <input type="submit" value="Unset Home Pod" />
            </form>
        </template>
    </div>
</template>

<style>
.graffiti-session-manager {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    justify-content: stretch;

    form {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        justify-content: stretch;
    }

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
