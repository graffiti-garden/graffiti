<script setup lang="ts">
import { ref } from "vue";
import { useGraffiti, useGraffitiSession } from "../../src/plugin";
import { type GraffitiObject, type JSONSchema4 } from "@graffiti-garden/api";

const graffiti = useGraffiti();
const session = useGraffitiSession();

const channels = ref(["graffiti-client-demo"]);

const noteSchema = {
    properties: {
        value: {
            properties: {
                content: {
                    type: "string",
                },
                createdAt: {
                    type: "string",
                },
            },
            required: ["content", "createdAt"],
        },
    },
} as const satisfies JSONSchema4;

const posting = ref(false);
const myNote = ref("");
async function postNote() {
    if (!myNote.value.length) return;
    if (!session.value) {
        alert("You are not logged in!");
        return;
    }
    posting.value = true;
    await graffiti.put<typeof noteSchema>(
        {
            channels: channels.value,
            value: {
                content: myNote.value,
                createdAt: new Date().toISOString(),
            },
        },
        session.value,
    );
    myNote.value = "";
    posting.value = false;
}

const editing = ref<string>("");
const editText = ref<string>("");
function startEditing(result: GraffitiObject<typeof noteSchema>) {
    editing.value = graffiti.locationToUri(result);
    editText.value = result.value.content;
}

const savingEdits = ref(false);
async function saveEdits(result: GraffitiObject<typeof noteSchema>) {
    if (!session.value) {
        alert("You are not logged in!");
        return;
    }
    savingEdits.value = true;
    await graffiti.patch(
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
    <h1>Graffiti Vue Wrapper Demo</h1>
    <p>
        This Graffiti application written as a
        <a href="https://vuejs.org/guide/scaling-up/sfc.html"
            >Vue Single File Component</a
        >
        and built with <a href="https://vitejs.dev/">Vite</a>. It uses the
        <a href="https://github.com/graffiti-garden/wrapper-vue"
            >Graffiti Vue.js wrapper</a
        >
        and the
        <a href="https://github.com/graffiti-garden/implementation-pouchdb"
            >PouchDB implementation of Graffiti</a
        >. View the source code
        <a
            href="https://github.com/graffiti-garden/wrapper-vue/tree/main/examples/node-vite-sfc"
            >on Github</a
        >.
    </p>
    <p v-if="$graffitiSession.value">
        Logged in as: {{ $graffitiSession.value.actor }}
        <button @click="graffiti.logout($graffitiSession.value)">
            Log out
        </button>
    </p>
    <p v-else-if="session === null">
        <button @click="graffiti.login()">Log in</button>
    </p>
    <p v-else>Loading...</p>
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
                @input="
                    (event) =>
                        event.target &&
                        'value' in event.target &&
                        typeof event.target.value === 'string' &&
                        (channels = [event.target.value])
                "
            />
        </div>
        <ul>
            <li v-if="isPolling">Loading...</li>
            <li
                v-for="result in results.sort(
                    (a, b) =>
                        // Sort by lastModified, most recent first
                        // lastModified are ISO strings
                        new Date(b.lastModified).getTime() -
                        new Date(a.lastModified).getTime(),
                )"
                :key="$graffiti.objectToUri(result)"
                class="post"
            >
                <div class="actor">
                    {{ result.actor }}
                </div>
                <div class="timestamp">
                    {{ new Date(result.lastModified).toLocaleString() }}
                </div>

                <div
                    class="content"
                    v-if="editing !== $graffiti.locationToUri(result)"
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
                    <li v-if="result.actor === session?.actor">
                        <button @click="$graffiti.delete(result, session)">
                            Delete
                        </button>
                    </li>
                    <li v-if="result.actor === session?.actor">
                        <button @click="startEditing(result)">Edit</button>
                    </li>
                    <li>
                        <a
                            target="_blank"
                            :href="$graffiti.locationToUri(result)"
                        >
                            🔗
                        </a>
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
    border-radius: 0.5rem;
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

    .actor {
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
