<script setup lang="ts">
import { type GraffitiSession, type GraffitiObjectTyped } from "@graffiti-garden/client-vue"
import Name from './Name.vue'
import Notes from "./Notes.vue";
import { noteSchema } from "./schemas"
import { ref, computed, inject, type Ref } from "vue";

const session = inject<Ref<GraffitiSession>>("graffitiSession")!;

const props = withDefaults(defineProps<{
  note: GraffitiObjectTyped<ReturnType<typeof noteSchema>>,
  follows: string[],
  showComments: boolean,
  showLikeCount: boolean,
  inReplyToContentAddress: string,
}>(), {
  follows: ()=>[],
  showComments: true,
  showLikeCount: true,
  inReplyToContentAddress: "",
});

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

const lookup : { [key: string]: string } = {
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

const blocks: any[] = [];
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
            <template v-if="note.webId === session.webId">
                <li v-if="!editing">
                    <button @click="editing = true; editText = note.value.content">edit</button>
                </li>
                <li>
                    <button @click="$graffiti.delete(note, session)">delete</button>
                </li>
            </template>
            <li>
                <a target="_blank" class="button" :href="$graffiti.locationToUrl(note)">link</a>
            </li>
            <li>
                <!-- <Annotation name="block" :ID="post.id" :collection="blocks" checked="blocked" unchecked="block" /> -->
            </li>
        </menu>
    </div>

    <p v-if="blocks.length" class="warning">this post is blocked by
      <ul>
        <li v-if="blocks.map(b=> b.webId).includes(session.webId)">you</li>
        <li v-for="author in blocks.map(b=> b.webId).filter(x=>x!==session.webId)">
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
        <form v-if="editing&&session.webId" @submit.prevent="$graffiti.patch({
          value: [ { op: 'replace', path: '/content', value: editText } ],
        }, note, session).then(()=> editing=false)">
          <textarea v-model="editText" v-focus>
          </textarea>
          <div class="edit-buttons">
            <input type="button" value="cancel" @click="editing=false">
            <input type="submit" value="save" />
            </div>
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
