<script setup lang="ts">
import { ref, computed, inject, type Ref } from "vue";
import Note from "./Note.vue";
import { noteSchema } from "./schemas";
import {
    useGraffiti,
    useDiscover,
    type GraffitiSession,
} from "@graffiti-garden/client-vue";

const graffiti = useGraffiti();
const sessionRef = inject<Ref<GraffitiSession>>("graffitiSession")!;

const props = withDefaults(
    defineProps<{
        webIds: string[];
        inReplyTo: string | undefined;
        at: string | undefined;
        prompt: string;
    }>(),
    {
        webIds: () => [],
        inReplyTo: undefined,
        at: undefined,
        prompt: "what's on your mind?",
    },
);

function channels() {
    const channels = [...props.webIds];
    if (props.inReplyTo) channels.push(props.inReplyTo);
    if (props.at) channels.push(props.at);
    return channels;
}

const {
    results: notes,
    poll: pollNotes,
    isPolling,
} = useDiscover(channels, () => noteSchema(props.inReplyTo), sessionRef);

const notesSorted = computed(() =>
    notes.value.sort(
        (a, b) =>
            new Date(b.value.createdAt).getTime() -
            new Date(a.value.createdAt).getTime(),
    ),
);

const isSubmitting = ref(false);
const noteContent = ref("");
async function submitNote() {
    if (!noteContent.value) return;
    const session = sessionRef.value;
    if (!session.webId) {
        alert("You are not logged in!");
        return;
    }
    isSubmitting.value = true;

    const note = {
        type: "Note",
        content: noteContent.value,
        createdAt: new Date().toISOString(),
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
                channels: [props.inReplyTo],
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
                channels: [props.at],
            },
            session,
        );
    } else {
        await graffiti.put<ReturnType<typeof noteSchema>>(
            {
                value: note,
                channels: [session.webId],
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

    <div>
        <button v-if="!isPolling" @click="pollNotes">🔄 refresh posts</button>
        <button v-else disabled>🔄 refreshing...</button>
    </div>
    <ul>
        <li v-for="note in notesSorted" :key="$graffiti.locationToUrl(note)">
            <Note :note="note" />
        </li>
    </ul>
</template>
