import Name from './name.js'

export default function({myID, useCollection}) { return {

  name: 'Post',

  props: ['posts', 'post'],

  components: { Name: Name(...arguments) },

  setup: (props)=> ({
    likes: useCollection(()=>({
      like: true,
      object: props.post.id
    })),

    comments: useCollection(()=>({
      post: { $type: 'string' },
      inReplyTo: props.post.id,
      timestamp: { $type: 'number' },
      id: { $type: 'string' }
    })),
  }),

  data: ()=> ({
    editing: false,
    editText: '',
    commentText: '',
    editMenuOpen: false,
    commentsOpen: false
  }),

  methods: {
    toggleLike() {
      if (this.likes.mine.length) {
        this.likes.removeMine()
      } else {
        this.likes.update({
          like: true,
          object: this.post.id,
          _inContextIf: [{
            _queryFailsWithout: ['object']
          }]
        })
      }
    },

    sumbitComment() {
      this.comments.update({
        post: this.commentText,
        inReplyTo: this.post.id,
        timestamp: Date.now(),
        id: crypto.randomUUID(),
        _inContextIf: [{
          _queryFailsWithout: [ 'inReplyTo' ]
        }]
      })

      this.commentText = ''
    }
  },

  computed: {
    formattedDate() {
      return new Date(this.post.timestamp)
        .toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric'
        })
    },

    sanitizedContent() {
      const lookup = {
          '&': "&amp;",
          '"': "&quot;",
          '\'': "&apos;",
          '<': "&lt;",
          '>': "&gt;"
      }

      return this.post.post
      // Remove all included tags
      .replace( /[&"'<>]/g, c => lookup[c] )
      // Replace urls with <a>
      .replace(/(https?:\/\/[^\s]+)/g, url=> `<a target="_blank" href="${url}">${url}</a>`)
    }
  },

  template: `
    <div class="post-modifiers" v-if="post._by=='${myID}'">
      <input :id="'menu' + post.id" type="checkbox" v-model="editMenuOpen" />
      <label :for="'menu' + post.id">⚙️</label>
      <ul v-if="editMenuOpen" v-click-away="() => editMenuOpen=false">
        <li v-if="!editing">
          <button @click="editing = true; editMenuOpen = false">
            edit
          </button>
        </li>
        <li>
          <button @click="posts.remove(post)">
            delete
          </button>
        </li>
      </ul>
    </div>

    <h3>
      <Name :ID="post._by" />
      <template v-if="'at' in post">
        <template v-for="id in post.at" :key="id">
          @<Name :ID="id" />
        </template>
      </template>
    </h3>
    <h4>
      {{ formattedTimestamp }}
    </h4>

    <p>
      <form v-if="editing" @submit.prevent="posts.update(post); editing=false">
        <textarea v-model="post.post" @focus="$event.target.select()" v-focus></textarea>
        <input type="submit" value="save">
      </form>
      <span v-else v-html="sanitizedContent"></span>
    </p>

    <div class="post-annotators">
      <input type="checkbox"
        :id="'like' + post._id"
        :checked="likes.mine.length">
      <label :for="'like' + post.id" @click="toggleLike">
        👍 like<template v-if="likes.mine.length">d</template>
      </label>

      <label disabled>
        likes: {{ likes.authors.length }}
      </label>

      <input type="checkbox"
        :id="'comments' + post.id"
        v-model="commentsOpen">
      <label :for="'comments' + post.id">
        comments: {{ comments.length }}
      </label>
    </div>

    <ul v-if="commentsOpen">
      <li class="post" v-for="comment in comments.sortBy('timestamp')" :key="comment.id">
        <Post :posts="comments" :post="comment"/>
      </li>
      <li class="post">
        <form @submit.prevent="sumbitComment">
          <textarea v-model="commentText" placeholder="write a comment..."></textarea>
          <input type="submit" value="reply">
        </form>
      </li>
    </ul>`
}}
