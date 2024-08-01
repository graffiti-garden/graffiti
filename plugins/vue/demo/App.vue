<script setup lang="ts">
import { ref } from "vue";
import {
    useGraffitiClient,
    GraffitiSessionManager,
    GraffitiQuery,
} from "../src/plugin";

const clientName = "Graffiti Vue Client Demo";
const myNote = ref("");
const channel = "graffiti-client-demo";

async function postNote(poll) {
    if (!myNote.value.length) return;
    const note = {
        type: "Note",
        content: myNote.value,
    };
    myNote.value = "";
    await useGraffitiClient().put({
        channels: [channel],
        value: note,
    });
    poll();
}
</script>

<template>
    <GraffitiSessionManager :clientName="clientName" />

    <template v-if="$graffitiSessionInfo.isSessionReady">
        <GraffitiQuery
            :channels="[channel]"
            :pods="[$graffitiSessionInfo.homePod]"
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
            <form @submit.prevent="postNote(poll)">
                <label for="my-note">Note:</label>
                <input
                    type="text"
                    id="my-note"
                    name="my-note"
                    v-model="myNote"
                />
            </form>
            <ul>
                <li v-for="result in results">
                    {{ result.value.content }}
                    by
                    {{ result.webId }}

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
                <li v-if="isPolling">Loading...</li>
            </ul>
        </GraffitiQuery>
    </template>
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
</style>
