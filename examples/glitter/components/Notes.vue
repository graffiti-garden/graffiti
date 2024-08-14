<script setup lang="ts">
import { ref, computed, type PropType } from "vue";
import { useNotes, Note as NoteType } from "../activities/notes";
import Note from "./Note.vue";
import {
    useGraffiti,
    useGraffitiSession,
    useQuery,
} from "@graffiti-garden/client-vue";

const graffiti = useGraffiti();
const graffitiSession = useGraffitiSession();

const props = defineProps({
    webIds: { type: Array as PropType<string[]>, default: [] },
    inReplyTo: { type: String, default: null },
    at: { type: String, default: null },
    prompt: { type: String, default: "what's on your mind?" },
});

function channels() {
    const channels = [...props.webIds];
    if (props.inReplyTo) channels.push(props.inReplyTo);
    if (props.at) channels.push(props.at);
    return channels;
}

const { results: notes, poll: pollNotes } = useQuery(channels, {
    query() {
        const q = {
            properties: {
                value: {
                    properties: {
                        type: { enum: ["Note"] },
                        content: { type: "string" },
                        createdAt: { type: "string" },
                        at: {
                            type: "array",
                            items: { type: "string" },
                        },
                        inReplyTo: props.inReplyTo
                            ? { enum: [props.inReplyTo] }
                            : { type: "string" },
                    },
                    required: ["type", "content", "createdAt"],
                },
            },
        };
        return q;
    },
});

const notesSorted = computed(() =>
    (notes.value as NoteType[]).sort(
        (a, b) =>
            new Date(b.value.createdAt).getTime() -
            new Date(a.value.createdAt).getTime(),
    ),
);

const isSubmitting = ref(false);
const noteContent = ref("");
async function submitNote() {
    if (!noteContent.value) return;
    isSubmitting.value = true;

    const note: NoteType["value"] = {
        type: "Note",
        content: noteContent.value,
        createdAt: new Date().toISOString(),
    };

    if (props.inReplyTo) {
        note.inReplyTo = props.inReplyTo;
        await graffiti.put({
            value: note,
            channels: [props.inReplyTo],
        });
    } else if (props.at) {
        note.at = [props.at];
        await graffiti.put({
            value: note,
            channels: [props.at],
        });
    } else {
        await graffiti.put({
            value: note,
            channels: [graffitiSession.webId],
        });
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

    <button @click="pollNotes">🔄</button>

    <ul>
        <li v-for="note in notesSorted" :key="$graffiti.locationToUrl(note)">
            <Note :note="note" />
        </li>
    </ul>
</template>
