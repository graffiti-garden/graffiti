<script setup lang="ts">
import { ref } from "vue";
import { useGraffiti, useGraffitiSession } from "../../src/plugin";
import type { GraffitiObject, JSONSchema } from "@graffiti-garden/api";

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
                published: {
                    type: "number",
                },
            },
            required: ["content", "published"],
        },
    },
} as const satisfies JSONSchema;

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
                published: Date.now(),
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
    editing.value = result.url;
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
        and built with <a href="https://vitejs.dev/">Vite</a>. The link to the
        source is unforuntately redacted for anonimization while the Graffiti
        paper is under review. The source code is self-evident in the
        <a href="../../">single-file examples</a>.
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
        autopoll
        :channels="channels"
        :schema="noteSchema"
        v-slot="{ objects, poll, isInitialPolling }"
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
            <li v-if="isInitialPolling">Loading...</li>
            <li
                v-for="object in objects.sort(
                    (a, b) => b.value.published - a.value.published,
                )"
                :key="object.url"
                class="post"
            >
                <div class="actor">
                    {{ object.actor }}
                </div>
                <div class="timestamp">
                    {{ new Date(object.value.published).toLocaleString() }}
                </div>

                <div class="content" v-if="editing !== object.url">
                    {{ object.value.content }}
                </div>
                <form
                    v-else
                    @submit.prevent="saveEdits(object)"
                    class="content"
                >
                    <input type="text" v-model="editText" />
                    <input type="submit" value="Save" />
                    <span v-if="savingEdits">Saving...</span>
                </form>

                <menu>
                    <li v-if="object.actor === session?.actor">
                        <button @click="$graffiti.delete(object, session)">
                            Delete
                        </button>
                    </li>
                    <li v-if="object.actor === session?.actor">
                        <button @click="startEditing(object)">Edit</button>
                    </li>
                    <li>
                        <a target="_blank" :href="object.url"> 🔗 </a>
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
