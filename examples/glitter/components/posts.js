import Name from './name.js'
import Like from './like.js'

export default function({myID, useCollection}) { return {

  components: {
    Name: Name(...arguments),
    Like: Like(...arguments)
  },

  name: 'Posts',

  props: ['queryMod', 'postMod', 'prompt'],

  setup: (props)=> ({
    posts: useCollection(()=>Object.assign({
      post: { $type: 'string' },
      id: { $type: 'string' },
      timestamp: { $type: 'number' },
    }, props.queryMod))
  }),

  data: ()=> ({
    postContent: '',
    editID: '',
    editMenuID: '',
    commentOpenID: ''
  }),

  methods: {
    submitPost() {
      if (!this.postContent) return

      this.posts.update(Object.assign({
        post: this.postContent,
        id: crypto.randomUUID(),
        timestamp: Date.now()
      }, this.postMod))

      this.postContent = ''
    },

    formattedTimestamp(post) {
      return new Date(post.timestamp)
        .toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric'
        })
    },

    sanitizedContent(post) {
      const lookup = {
          '&': "&amp;",
          '"': "&quot;",
          '\'': "&apos;",
          '<': "&lt;",
          '>': "&gt;"
      }

      return post.post
      // Remove all included tags
      .replace( /[&"'<>]/g, c => lookup[c] )
      // Replace urls with <a>
      .replace(/(https?:\/\/[^\s]+)/g, url=> `<a target="_blank" href="${url}">${url}</a>`)
    },

    commentsQueryMod(post) {
      return { inReplyTo: post.id }
    },

    commentsPostMod(post) {
      return {
        inReplyTo: post.id,
        _inContextIf: [{
          _queryFailsWithout: [ 'inReplyTo' ]
        }]
      }
    }
  },

  template: `
    <form @submit.prevent="submitPost">
      <textarea v-model="postContent" autofocus :placeholder="prompt">
      </textarea>
      <input type="submit" value="post">
    </form>

    <ul>
      <li v-for="post in posts.sortBy('-timestamp')"
        :key="post.id">

        <h1>
          <Name :ID="post._by" />
          <template v-if="'at' in post">
            <template v-for="id in post.at" :key="id">
              @<Name :ID="id" />
            </template>
          </template>
        </h1>

        <h2>
          {{ formattedTimestamp(post) }}
        </h2>

        <p>
          <form v-if="editID==post.id" @submit.prevent="posts.update(post); editID=''">
            <textarea v-model="post.post" @focus="$event.target.select()" v-focus>
            </textarea>
            <input type="submit" value="save">
          </form>
          <span v-else v-html="sanitizedContent(post)"></span>
        </p>

        <div class="modifiers" v-if="post._by=='${myID}'">
          <input type="checkbox"
            :id="'menu' + post.id"
            :checked="editMenuID==post.id"
            @click.prevent="editMenuID=editMenuID==post.id?'':post.id">
          <label :for="'menu' + post.id">⚙️</label>

          <menu v-if="editMenuID==post.id" v-click-away="()=> editMenuID=''">
            <li v-if="editID!=post.id">
              <button @click="editID=post.id;editMenuID=''">
                edit
              </button>
            </li>
            <li v-else>
              <Block :ID="id">
            </li>
            <li>
              <button @click="posts.remove(post)">
                delete
              </button>
            </li>
          </menu>
        </div>

        <div class="post-annotators">
          <Like :ID="post.id"/>

          <input type="checkbox"
            :id="'comments' + post.id"
            :checked="commentOpenID==post.id"
            @click="commentOpenID=commentOpenID==post.id?'':post.id">
          <label :for="'comments' + post.id">
            comments
          </label>
        </div>

        <Posts v-if="commentOpenID==post.id"
          :queryMod="commentsQueryMod(post)"
          :postMod="commentsPostMod(post)"
          prompt="write a comment..."/>
      </li>
    </ul>`
}}
