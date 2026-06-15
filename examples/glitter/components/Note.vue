<script setup lang="ts">
import type { GraffitiObject } from "@graffiti-garden/api";
import {
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import Name from "./Name.vue";
import Notes from "./Notes.vue";
import { noteSchema } from "./schemas";
import { ref, computed } from "vue";

const graffiti = useGraffiti();
const session = useGraffitiSession();

const props = withDefaults(
    defineProps<{
        note: GraffitiObject<ReturnType<typeof noteSchema>>;
        follows?: string[];
        showInReplyTo?: boolean;
        isInReplyTo?: boolean;
    }>(),
    {
        follows: () => [],
        showInReplyTo: false,
    },
);

const formattedTimestamp = computed(() =>
    props.note
        ? new Date(props.note.value.published).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
          })
        : "",
);

const lookup: { [key: string]: string } = {
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
    "<": "&lt;",
    ">": "&gt;",
};
const sanitizedContent = computed(() =>
    props.note.value.content
        // Remove all included tags
        .replace(/[&"'<>]/g, (c) => lookup[c])
        // Replace urls with <a>
        .replace(
            /(https?:\/\/[^\s]+)/g,
            (url) => `<a target="_blank" href="${url}">${url}</a>`,
        ),
);

const commentsOpen = ref(false);
const editMenuOpen = ref(false);

async function deleteNote() {
    const activeSession = session.value;
    if (!activeSession) return;
    await graffiti.delete(props.note.url, activeSession);
}
</script>

<template>
    <h1>
        <Name :actor="note.actor" />
        <template v-if="note.value.to">
            <template v-for="actor in note.value.to" :key="actor">
                @<Name :actor="actor" />
            </template>
        </template>
    </h1>

    <h2>
        {{ formattedTimestamp }}
    </h2>

    <div
        class="modifiers"
        v-if="note.actor === session?.actor"
        v-click-away="() => (editMenuOpen = false)"
    >
        <input
            type="checkbox"
            :id="'menu' + note.url"
            :checked="editMenuOpen"
            @click="editMenuOpen = !editMenuOpen"
        />
        <label :for="'menu' + note.url">⚙️</label>

        <menu v-if="editMenuOpen" @click="editMenuOpen = false">
            <li>
                <button @click="deleteNote">delete</button>
            </li>
        </menu>
    </div>

    <p v-html="sanitizedContent"></p>

    <GraffitiGet
        v-if="note.value.inReplyTo && showInReplyTo"
        v-slot="{ object }"
        :url="note.value.inReplyTo"
        :schema="noteSchema()"
    >
        <li v-if="object" class="inReplyTo">
            <Note :note="object" isInReplyTo />
        </li>
    </GraffitiGet>

    <div class="post-annotators" v-if="!isInReplyTo">
        <input
            type="checkbox"
            :id="'comments' + note.url"
            :checked="commentsOpen"
            @click="commentsOpen = !commentsOpen"
        />
        <label :for="'comments' + note.url"> comments </label>
    </div>

    <Notes
        v-if="commentsOpen"
        :inReplyTo="note.url"
        prompt="write a comment..."
    />
</template>

<style>
.inReplyTo {
    margin-top: -0.5rem;
    margin-left: 1rem;
    margin-bottom: 1rem;
    margin-right: 1rem;
}
</style>
