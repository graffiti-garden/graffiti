<script setup lang="ts">
import { ref } from "vue";
import {
    useGraffiti,
    GraffitiDiscover,
    type JSONSchema4,
    type GraffitiObjectTyped,
    type GraffitiSession,
} from "../src/plugin";
import {
    getDefaultSession as getDefaultSession,
    handleIncomingRedirect,
} from "@inrupt/solid-client-authn-browser";

const session = ref<GraffitiSession>({
    pods: ["http://localhost:3000"],
});
const solidSession = getDefaultSession();
function handleSolidSession() {
    if (solidSession.info.isLoggedIn && solidSession.info.webId) {
        session.value = {
            ...session.value,
            webId: solidSession.info.webId,
            fetch: solidSession.fetch,
            pod: "http://localhost:3000",
        };
    } else {
        session.value = {
            pods: session.value.pods,
        };
    }
}
solidSession.events.on("login", handleSolidSession);
solidSession.events.on("logout", handleSolidSession);
async function logIn(oidcIssuer: string) {
    await solidSession.login({
        oidcIssuer,
        redirectUrl: window.origin,
        clientName: "graffiti vue demo",
    });
}
async function logOut() {
    await solidSession.logout();
}
handleIncomingRedirect({ restorePreviousSession: true });
const oidcIssuerOptions = [
    "https://solid.theias.place",
    "https://login.inrupt.com",
    "https://solidcommunity.net",
    "https://solidweb.org",
    "https://solidweb.me",
    "https://teamid.live",
    "https://solid.redpencil.io",
    "https://idp.use.id",
    "https://inrupt.net",
];
const selectedIssuer = ref("");

const channels = ref(["graffiti-client-demo"]);

const noteSchema = {
    properties: {
        value: {
            properties: {
                type: {
                    enum: ["Note"],
                    type: "string",
                },
                content: {
                    type: "string",
                },
            },
            required: ["type", "content"],
        },
    },
} satisfies JSONSchema4;

const posting = ref(false);
const myNote = ref("");
async function postNote() {
    if (!myNote.value.length) return;
    if (!session.value.webId) {
        alert("You are not logged in!");
        return;
    }
    posting.value = true;
    await useGraffiti().put<typeof noteSchema>(
        {
            channels: channels.value,
            value: {
                type: "Note",
                content: myNote.value,
            },
        },
        session.value,
    );
    myNote.value = "";
    posting.value = false;
}

const editing = ref<string>("");
const editText = ref<string>("");
function startEditing(result: GraffitiObjectTyped<typeof noteSchema>) {
    editing.value = useGraffiti().locationToUrl(result);
    editText.value = result.value.content;
}

const savingEdits = ref(false);
async function saveEdits(result: GraffitiObjectTyped<typeof noteSchema>) {
    if (!session.value.webId) {
        alert("You are not logged in!");
        return;
    }
    savingEdits.value = true;
    await useGraffiti().patch(
        {
            value: [{ op: "replace", path: "/content", value: editText.value }],
        },
        result,
        session.value,
    );
    editText.value = "";
    editing.value = "";
    savingEdits.value = false;
}
</script>

<template>
    <div>
        <div v-if="session.webId">
            Logged in as {{ session.webId }}
            <button @click="logOut">Log out</button>
        </div>
        <form v-else @submit.prevent="logIn(selectedIssuer)">
            <label for="oidc-choice">Choose an Identity Provider:</label>
            <input
                list="oidc-issuers"
                id="oidc-choice"
                name="oidc-choice"
                v-model="selectedIssuer"
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
    </div>
    <GraffitiDiscover
        :channels="channels"
        :schema="noteSchema"
        :session="session"
        v-slot="{ results, poll, isPolling }"
    >
        <div class="controls">
            <form @submit.prevent="postNote">
                <label for="my-note">Note:</label>
                <input
                    type="text"
                    id="my-note"
                    name="my-note"
                    v-model="myNote"
                />
                <input type="submit" value="Post" />
                <span v-if="posting">Posting...</span>
            </form>

            <button @click="poll">Refresh</button>

            Change the channel:
            <input
                type="text"
                :value="channels[0]"
                @input="(event) => (channels = [event.target.value])"
            />
        </div>
        <ul>
            <li v-if="isPolling">Loading...</li>
            <li
                v-for="result in results.sort(
                    (a, b) =>
                        b.lastModified.getTime() - a.lastModified.getTime(),
                )"
                class="post"
            >
                <div class="webId">
                    {{ result.webId }}
                </div>
                <div class="timestamp">
                    {{ result.lastModified.toLocaleString() }}
                </div>

                <div
                    class="content"
                    v-if="editing !== $graffiti.locationToUrl(result)"
                >
                    {{ result.value.content }}
                </div>
                <form
                    v-else
                    @submit.prevent="saveEdits(result)"
                    class="content"
                >
                    <input type="text" v-model="editText" />
                    <input type="submit" value="Save" />
                    <span v-if="savingEdits">Saving...</span>
                </form>

                <menu>
                    <li>
                        <a
                            target="_blank"
                            :href="$graffiti.locationToUrl(result)"
                        >
                            🌐
                        </a>
                    </li>
                    <li v-if="result.webId === session?.webId">
                        <button @click="$graffiti.delete(result, session)">
                            Delete
                        </button>
                    </li>
                    <li v-if="result.webId === session?.webId">
                        <button @click="startEditing(result)">Edit</button>
                    </li>
                </menu>
            </li>
        </ul>
    </GraffitiDiscover>
</template>

<style>
:root {
    font-family: Arial, sans-serif;
}

.graffiti-session-manager {
    border: 1px solid #ccc;
    border-radius: 0.5rem;
    padding: 1rem;
}

ul {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0;
}

.post {
    list-style: none;
    border: 1px solid #ccc;
    border-radius: 0.5rem;
    margin: 0;
    padding: 1rem;

    .webId {
        font-size: 1rem;
        font-weight: bold;
    }

    .timestamp {
        font-size: 0.8rem;
        color: #666;
    }

    .content {
        margin: 1rem;
        margin-left: 0;
        margin-right: 0;
    }

    menu {
        display: flex;
        padding: 0;
        gap: 1rem;

        li {
            list-style: none;
        }

        a {
            text-decoration: none;
            color: #000;
        }
    }
}
</style>
