<script setup lang="ts">
import { ref, computed } from "vue";
import Note from "./Note.vue";
import { noteSchema } from "./schemas";
import {
    useGraffiti,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();

const props = withDefaults(
    defineProps<{
        actors?: string[];
        inReplyTo?: string;
        at?: string[];
        prompt: string;
    }>(),
    {
        actors: () => [],
        prompt: "what's on your mind?",
    },
);

function channels() {
    const channels = [...props.actors];
    if (props.inReplyTo) channels.push(props.inReplyTo);
    if (props.at) channels.push(...props.at);
    return channels;
}

const {
    objects: notes,
    poll: pollNotes,
    isInitialPolling: isPolling,
} = useGraffitiDiscover(
    channels,
    () => noteSchema(props.inReplyTo),
    sessionRef,
);

const notesSorted = computed(() =>
    notes.value.sort((a, b) => b.value.published - a.value.published),
);

const isSubmitting = ref(false);
const noteContent = ref("");
async function submitNote() {
    if (!noteContent.value) return;
    const session = sessionRef.value;
    if (!session) {
        alert("You are not logged in!");
        return;
    }
    isSubmitting.value = true;

    const note = {
        content: noteContent.value,
        published: Date.now(),
        at: undefined,
        inReplyTo: undefined,
    } as const;

    if (props.inReplyTo) {
        await graffiti.put<ReturnType<typeof noteSchema>>(
            {
                value: {
                    ...note,
                    inReplyTo: props.inReplyTo,
                },
                channels: [props.inReplyTo, session.actor],
            },
            session,
        );
    } else if (props.at) {
        await graffiti.put<ReturnType<typeof noteSchema>>(
            {
                value: {
                    ...note,
                    at: props.at,
                },
                channels: [...props.at, session.actor],
            },
            session,
        );
    } else {
        await graffiti.put<ReturnType<typeof noteSchema>>(
            {
                value: note,
                channels: [session.actor],
            },
            session,
        );
    }

    isSubmitting.value = false;
    noteContent.value = "";
}
</script>

<template>
    <form @submit.prevent="submitNote">
        <textarea
            v-model="noteContent"
            autofocus
            :placeholder="prompt"
            :disabled="isSubmitting"
        />
        <input type="submit" value="post" />
    </form>

    <div class="refresher">
        <button v-if="!isPolling" @click="pollNotes">refresh posts</button>
        <button v-else disabled>refreshing...</button>
    </div>
    <ul>
        <li v-for="note in notesSorted" :key="note.url">
            <Note :note="note" :showInReplyTo="!inReplyTo" />
        </li>
    </ul>
</template>

<style>
form {
    margin: 0;
}

.refresher {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    margin: 0;
    /* display: flex;
    flex-direction: column;
    align-items: flex; */

    button {
        border: none;
        padding: 0;
    }

    button:hover {
        cursor: pointer;
        background: unset;
        color: inherit;
        text-decoration: underline;
    }
}
</style>
