<script setup lang="ts">
import { ref } from "vue";
import {
    GraffitiIdentityProviderLogin,
    useGraffiti,
    GraffitiDiscover,
    type GraffitiObjectTyped,
    useGraffitiSession,
} from "../src/plugin";

// Initialize the pods used in the session
const session = useGraffitiSession();
session.value.pods = ["https://pod.graffiti.garden"];

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
} as const;

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
    <GraffitiIdentityProviderLogin client-name="vue client demo" />
    <GraffitiDiscover
        :channels="channels"
        :schema="noteSchema"
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
