<script setup lang="ts">
// import Annotation from './annotation.js'
import Name from './Name.vue'
import Notes from "./Notes.vue";
import { Note as NoteType } from "../activities/notes";
import { ref, computed, type PropType } from "vue";

const props = defineProps({
    note: {
        type: Object as PropType<NoteType>,
        required: true,
    },
    follows: {
        type: Array,
        default: [],
    },
    showComments: {
        type: Boolean,
        default: true,
    },
    showLikeCount: {
        type: Boolean,
        default: true,
    },
    inReplyToContentAddress: {
        type: String,
        default: "",
    },
});

// likes: useCollection(()=>({
//   'like.id': props.post.id
// })),
// blocks: useCollection(()=>({
//   'block.id': props.post.id,
//   _by: { $in: [myID, ...props.follows] }
// })),

const formattedTimestamp = computed(() =>
    props.note
        ? new Date(props.note.value.createdAt).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
          })
        : "",
);

const lookup = {
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

const spoilerOpen = ref(false);
const commentsOpen = ref(false);
const editMenuOpen = ref(false);
const editing = ref(false);
const editText = ref("");

const blocks = [];
const likes = [];
</script>

<template>
    <h1>
        <Name :webId="note.webId" />
        <template v-if="note.value.at">
            <template v-for="webId in note.value.at" :key="webId">
                @<Name :webId="webId" />
            </template>
        </template>
    </h1>

    <h2>
        {{ formattedTimestamp }}
    </h2>

    <div class="modifiers" v-click-away="() => (editMenuOpen = false)">
        <input
            type="checkbox"
            :id="'menu' + $graffiti.locationToUrl(note)"
            :checked="editMenuOpen"
            @click="editMenuOpen = !editMenuOpen"
        />
        <label :for="'menu' + $graffiti.locationToUrl(note)">⚙️</label>

        <menu v-if="editMenuOpen" @click="editMenuOpen = false">
            <template v-if="note.webId === $graffitiSession.webId">
                <li v-if="!editing">
                    <button @click="editing = true; editText = note.value.content">edit</button>
                </li>
                <li>
                    <button @click="$graffiti.delete(note)">delete</button>
                </li>
            </template>
            <template v-else>
                <li>
                    <!-- <Annotation name="block" :ID="post.id" :collection="blocks" checked="blocked" unchecked="block" /> -->
                </li>
            </template>
        </menu>
    </div>

    <p v-if="blocks.length" class="warning">this post is blocked by
      <ul>
        <li v-if="blocks.map(b=> b.webId).includes($graffitiSession.webId)">you</li>
        <li v-for="author in blocks.map(b=> b.webId).filter(x=>x!==$graffitiSession.webId)">
          <Name :webId="author" />
        </li>
      </ul>.
      <input type="checkbox"
        :id="'spoiler' + $graffiti.locationToUrl(note)"
        :checked="spoilerOpen"
        @click="spoilerOpen=!spoilerOpen">
      <label :for="'spoiler' + $graffiti.locationToUrl(note)">show it anyways?</label>
    </p>
    <template v-if="spoilerOpen || !blocks.length">
      <p>
        <form v-if="editing" @submit.prevent="$graffiti.patch({
          value: [ { op: 'replace', path: '/content', value: editText } ],
        }, note).then(()=> editing=false)">
          <textarea v-model="editText" v-focus>
          </textarea>
          <input type="submit" value="save">
        </form>
        <span v-else v-html="sanitizedContent"></span>
      </p>

      <div class="post-annotators">
        <!-- <Annotation name="like" :ID="post.id" :collection="likes" checked="👍 liked" unchecked="👍 like"/> -->

        <!-- <label v-if="showLikeCount" disabled>
          likes: {{ likes.authors.length }}
        </label> -->

        <template v-if="showComments">
          <input type="checkbox"
            :id="'comments' + $graffiti.locationToUrl(note)"
            :checked="commentsOpen"
            @click="commentsOpen=!commentsOpen">
          <label :for="'comments' + $graffiti.locationToUrl(note)">
            comments
          </label>
        </template>
      </div>

      <Notes v-if="commentsOpen"
        :inReplyTo="$graffiti.locationToUrl(note)"
        prompt="write a comment..."/>
    </template>
</template>
