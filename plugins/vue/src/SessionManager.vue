<script setup lang="ts">
import { ref, type PropType } from "vue";
import {
    useGraffitiSession,
    webIdLogin,
    webIdLogout,
    setDefaultPod,
    unsetDefaultPod,
} from "./session";

defineProps({
    oidcIssuerOptions: {
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
    podOptions: {
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
const selectedDefaultPod = ref("");

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
                        v-for="issuer in oidcIssuerOptions"
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
                v-if="!session.defaultPod"
                @submit.prevent="setDefaultPod(selectedDefaultPod)"
            >
                <label for="default-pod-choice">Choose a Default Pod:</label>
                <input
                    list="default-pods"
                    id="default-pod-choice"
                    name="default-pod-choice"
                    v-model="selectedDefaultPod"
                    @mouseover="focusInput"
                    placeholder="https://example.com"
                />

                <datalist id="default-pods">
                    <option v-for="pod in podOptions" :value="pod"></option>
                </datalist>
                <input type="submit" value="Set Default Pod" />
            </form>
            <form v-else @submit.prevent="unsetDefaultPod">
                <label for="default-pod">Your Default Pod is:</label>
                <input
                    id="default-pod"
                    type="text"
                    readonly
                    :value="session.defaultPod"
                />
                <input type="submit" value="Unset Default Pod" />
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
