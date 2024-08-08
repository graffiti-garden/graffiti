<script setup lang="ts">
import { ref, computed } from "vue";
import {
    useGraffiti,
    GraffitiSessionManager,
    GraffitiQuery,
} from "../src/plugin";
import { type GraffitiObject } from "@graffiti-garden/client-core";

const clientName = "Graffiti Vue Client Demo";
const myNote = ref("");

const channel = ref("graffiti-client-demo");
const channels = [channel];

async function postNote(poll: () => void) {
    if (!myNote.value.length) return;
    const note = {
        type: "Note",
        content: myNote.value,
    };
    myNote.value = "";
    await useGraffiti().put({
        channels: [channel.value],
        value: note,
    });
    poll();
}

const editing = ref<string>("");
const editText = ref<string>("");
function startEditing(result: GraffitiObject) {
    editing.value = useGraffiti().locationToUrl(result);
    editText.value = result.value.content;
}

async function saveEdits(result: GraffitiObject, poll: () => void) {
    const newText = editText.value;
    editText.value = "";
    editing.value = "";
    await useGraffiti().patch(
        {
            value: [{ op: "replace", path: "/content", value: newText }],
        },
        result,
    );
    poll();
}
</script>

<template>
    <GraffitiSessionManager
        :clientName="clientName"
        redirectPath="/client-vue/"
    />
    <GraffitiQuery
        :channels="channels"
        :query="{
            properties: {
                value: {
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['Note'],
                        },
                        content: {
                            type: 'string',
                        },
                    },
                    required: ['type', 'content'],
                },
            },
        }"
        v-slot="{ results, poll, isPolling }"
    >
        <div class="controls">
            <form
                v-if="$graffitiSession.isReady"
                @submit.prevent="postNote(poll)"
            >
                <label for="my-note">Note:</label>
                <input
                    type="text"
                    id="my-note"
                    name="my-note"
                    v-model="myNote"
                />
                <input type="submit" value="Post" />
            </form>

            <button @click="() => poll()">Refresh</button>

            Change the channel:
            <input type="text" v-model="channel" />
        </div>
        <ul>
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
                    @submit.prevent="saveEdits(result, poll)"
                    class="content"
                >
                    <input type="text" v-model="editText" />
                    <input type="submit" value="Save" />
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
                    <li v-if="result.webId === $graffitiSession.webId">
                        <button
                            @click="
                                async () => {
                                    await $graffiti.delete(result);
                                    poll();
                                }
                            "
                        >
                            Delete
                        </button>
                    </li>
                    <li v-if="result.webId === $graffitiSession.webId">
                        <button @click="startEditing(result)">Edit</button>
                    </li>
                </menu>
            </li>
            <li v-if="isPolling">Loading...</li>
        </ul>
    </GraffitiQuery>
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
