<script setup lang="ts">
import { computed, ref } from "vue";
import { useGraffiti } from "../../src/plugin";
import type { GraffitiSession, JSONSchema } from "@graffiti-garden/api";

const graffiti = useGraffiti();

const channel = ref("graffiti-client-dem");
const channels = computed(() => [channel.value]);
const autopoll = ref(true);
const polling = ref(false);

const noteSchema = {
    properties: {
        value: {
            properties: {
                content: { type: "string" },
                published: { type: "number" },
                attachments: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            url: { type: "string" },
                        },
                        required: ["url"],
                    },
                },
            },
            required: ["content", "published"],
        },
    },
} as const satisfies JSONSchema;

const posting = ref(false);
const myNote = ref("");
async function postNote(session: GraffitiSession) {
    if (!myNote.value.length) return;
    posting.value = true;
    await graffiti.post<typeof noteSchema>(
        {
            channels: channels.value,
            value: {
                content: myNote.value,
                published: Date.now(),
                ...(fileToUpload.value
                    ? {
                          attachments: [
                              {
                                  url: await graffiti.postMedia(
                                      { data: fileToUpload.value },
                                      session,
                                  ),
                              },
                          ],
                      }
                    : {}),
            },
        },
        session,
    );
    myNote.value = "";
    fileToUpload.value = null;
    posting.value = false;
}

const fileToUpload = ref<File | null>(null);
function setFileToUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files?.length) return;
    fileToUpload.value = target.files[0];
}
</script>

<template>
    <header>
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
            <a href="https://github.com/graffiti-garden/implementation-remote"
                >Remote implementation of Graffiti</a
            >. View the source code
            <a
                href="https://github.com/graffiti-garden/wrapper-vue/tree/main/examples/sfc"
                >on Github</a
            >.
        </p>
    </header>

    <section>
        <h2>Account</h2>

        <template v-if="$graffitiSession.value">
            <p>
                Logged in as
                <code>
                    <GraffitiActorToHandle
                        :actor="$graffitiSession.value.actor"
                    />
                </code>
            </p>

            <button
                type="button"
                @click="graffiti.logout($graffitiSession.value)"
            >
                Log out
            </button>
        </template>

        <template v-else-if="$graffitiSession.value === null">
            <p>You are not logged in.</p>
            <button type="button" @click="graffiti.login()">Log in</button>
        </template>

        <p v-else>
            <em>Loading…</em>
        </p>
    </section>

    <section>
        <h2>Channel</h2>

        <label for="channel">
            Choose a channel to view posts from and write posts to.
        </label>
        <input type="text" v-model="channel" />
    </section>

    <section>
        <h2>Post Creator</h2>
        <form
            v-if="$graffitiSession.value"
            @submit.prevent="postNote($graffitiSession.value)"
        >
            <input
                required
                :disabled="posting"
                v-model="myNote"
                placeholder="Enter a message"
            />
            <label for="file-input"> Add a file to your post </label>
            <input
                id="file-input"
                type="file"
                accept="*"
                @change="setFileToUpload"
            />
            <button :disabled="posting">
                {{ posting ? "Posting..." : "Post" }}
            </button>
        </form>
    </section>

    <section>
        <h2>Posts</h2>
        <GraffitiDiscover
            :autopoll="autopoll"
            :channels="channels"
            :schema="noteSchema"
            :session="$graffitiSession.value"
            v-slot="{ objects, poll, isFirstPoll }"
        >
            <nav>
                <ul>
                    <li>
                        <label>
                            <input type="checkbox" v-model="autopoll" />
                            Enable autopoll
                        </label>
                    </li>
                    <li v-if="!autopoll">
                        <button
                            @click="
                                polling = true;
                                poll().then(() => (polling = false));
                            "
                            :disabled="polling"
                        >
                            {{ polling ? "Polling..." : "Poll" }}
                        </button>
                    </li>
                </ul>
            </nav>
            <ul v-if="!isFirstPoll">
                <li v-for="object in objects" :key="object.url">
                    <GraffitiObjectInfo :object="object" />
                    <ul v-if="object.value.attachments">
                        <li
                            v-for="attachment in object.value.attachments"
                            :key="attachment.url"
                        >
                            <GraffitiGetMedia
                                :url="attachment.url"
                                :accept="{}"
                            />
                        </li>
                    </ul>
                </li>
            </ul>
            <p v-else>
                <em> Loading... </em>
            </p>
        </GraffitiDiscover>
    </section>
</template>
