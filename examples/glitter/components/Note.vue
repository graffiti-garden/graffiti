<script setup lang="ts">
import type { GraffitiObject } from "@graffiti-garden/api";
import { useGraffitiSession } from "@graffiti-garden/wrapper-vue";
import Name from "./Name.vue";
import Notes from "./Notes.vue";
import { noteSchema } from "./schemas";
import { ref, computed } from "vue";

const session = useGraffitiSession();

const props = withDefaults(
    defineProps<{
        note: GraffitiObject<ReturnType<typeof noteSchema>>;
        follows?: string[];
        inReplyToContentAddress?: string;
    }>(),
    {
        follows: () => [],
        inReplyToContentAddress: "",
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
const editing = ref(false);
const editText = ref("");
</script>

<template>
    <h1>
        <Name :actor="note.actor" />
        <template v-if="note.value.at">
            <template v-for="actor in note.value.at" :key="actor">
                @<Name :actor="actor" />
            </template>
        </template>
    </h1>

    <h2>
        {{ formattedTimestamp }}
    </h2>

    <div class="modifiers" v-click-away="() => (editMenuOpen = false)">
        <input
            type="checkbox"
            :id="'menu' + note.url"
            :checked="editMenuOpen"
            @click="editMenuOpen = !editMenuOpen"
        />
        <label :for="'menu' + note.url">⚙️</label>

        <menu v-if="editMenuOpen" @click="editMenuOpen = false">
            <template v-if="note.actor === session?.actor">
                <li v-if="!editing">
                    <button
                        @click="
                            editing = true;
                            editText = note.value.content;
                        "
                    >
                        edit
                    </button>
                </li>
                <li>
                    <button @click="$graffiti.delete(note, session)">
                        delete
                    </button>
                </li>
            </template>
            <li>
                <a target="_blank" class="button" :href="note.url">link</a>
            </li>
        </menu>
    </div>

    <form
        v-if="editing && session"
        @submit.prevent="
            $graffiti
                .patch(
                    {
                        value: [
                            {
                                op: 'replace',
                                path: '/content',
                                value: editText,
                            },
                        ],
                    },
                    note,
                    session,
                )
                .then(() => (editing = false))
        "
    >
        <textarea v-model="editText" v-focus> </textarea>
        <div class="edit-buttons">
            <input type="button" value="cancel" @click="editing = false" />
            <input type="submit" value="save" />
        </div>
    </form>
    <p v-else v-html="sanitizedContent"></p>

    <p v-if="note.value.inReplyTo" class="inReplyTo">
        In reply to:
        <a :href="note.value.inReplyTo">{{ note.value.inReplyTo }}</a>
    </p>

    <div class="post-annotators">
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
    font-size: 70%;
    color: var(--grey);
}
</style>
