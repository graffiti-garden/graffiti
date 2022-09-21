import Name from './name.js'
import Annotation from './annotation.js'

export default function({myID, useCollection}) { return {

  components: {
    Name: Name(...arguments),
    Annotation: Annotation(...arguments),
    // Like this to prevent recursion
    Posts: Vue.defineAsyncComponent(
      async ()=> (await import('./posts.js')).default(...arguments))
  },

  props: {
    post: null,
    follows: {
      type: Array,
      default: []
    }
  },

  setup: (props)=> ({
    likes: useCollection(()=>({
      'like.id': props.post.id
    })),
    blocks: useCollection(()=>({
      'block.id': props.post.id,
      _by: { $in: [myID, ...props.follows] }
    })),
  }),

  data: ()=> ({
    spoilerOpen: false,
    commentsOpen: false,
    editMenuOpen: false,
    editing: false,
  }),

  computed: {
    formattedTimestamp() {
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
    },

    commentsQueryMod() {
      return { inReplyTo: this.post.id }
    },

    commentsPostMod() {
      return {
        inReplyTo: this.post.id,
        _inContextIf: [{
          _queryFailsWithout: [ 'inReplyTo' ]
        }]
      }
    }

  },

  template: `
    <h1>
      <Name :ID="post._by" />
      <template v-if="'at' in post">
        <template v-for="id in post.at" :key="id">
          @<Name :ID="id" />
        </template>
      </template>
    </h1>

    <h2>
      {{ formattedTimestamp }}
    </h2>

    <div class="modifiers" v-click-away="()=> editMenuOpen=false">
      <input type="checkbox"
        :id="'menu' + post.id"
        :checked="editMenuOpen"
        @click="editMenuOpen=!editMenuOpen">
      <label :for="'menu' + post.id">⚙️</label>

      <menu v-if="editMenuOpen" @click="editMenuOpen=false">
        <template v-if="post._by=='${myID}'">
          <li v-if="!editing">
            <button @click="editing=true">
              edit
            </button>
          </li>
          <li>
            <button @click="post._remove()">
              delete
            </button>
          </li>
        </template>
        <template v-else>
          <li>
            <Annotation name="block" :ID="post.id" :collection="blocks" checked="blocked" unchecked="block" />
          </li>
        </template>
      </menu>
    </div>

    <p v-if="blocks.length" class="warning">
      this post is blocked by
      <ul>
        <li v-if="blocks.authors.includes('${myID}')">you</li>
        <li v-for="author in blocks.authors.filter(x=>x!='${myID}')">
          <Name :ID="author" />
        </li>
      </ul>.
      <input type="checkbox"
        :id="'spoiler' + post.id"
        :checked="spoilerOpen"
        @click="spoilerOpen=!spoilerOpen">
      <label :for="'spoiler' + post.id">show it anyways?</label>
    </p>
    <template v-if="spoilerOpen || !blocks.length">
      <p>
        <form v-if="editing" @submit.prevent="post._update(); editing=false">
          <textarea v-model="post.post" @focus="$event.target.select()" v-focus>
          </textarea>
          <input type="submit" value="save">
        </form>
        <span v-else v-html="sanitizedContent"></span>
      </p>

      <div class="post-annotators">
        <Annotation name="like" :ID="post.id" :collection="likes" checked="👍 liked" unchecked="👍 like"/>

        <label disabled>
          likes: {{ likes.authors.length }}
        </label>

        <input type="checkbox"
          :id="'comments' + post.id"
          :checked="commentsOpen"
          @click="commentsOpen=!commentsOpen">
        <label :for="'comments' + post.id">
          comments
        </label>
      </div>

      <Posts v-if="commentsOpen"
        :queryMod="commentsQueryMod"
        :postMod="commentsPostMod"
        :follows="follows"
        prompt="write a comment..."/>
    </template>`
}}
