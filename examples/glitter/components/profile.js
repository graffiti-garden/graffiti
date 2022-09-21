import Name from './name.js'
import Post from './post.js'

export default function({myID, useCollection}) { return {

  components: {
    Name: Name(...arguments),
    Post: Post(...arguments)
  },

  props: ['ID'],

  setup: (props)=> ({
    posts: useCollection(()=>({
      post: { $type: 'string' },
      id: { $type: 'string' },
      timestamp: { $type: 'number' },
      $or: [
        { _by: props.ID },
        { at: props.ID }
      ]
    }))
  }),

  data: ()=> ({ postContent: '' }),

  computed: {
    placeholder() {
      return this.ID==myID?
        "what's on your mind?" :
        "to my dear friend..."
    }
  },

  methods: {
    submitPost() {
      if (!this.postContent) return

      const post = {
        post: this.postContent,
        id: crypto.randomUUID(),
        timestamp: Date.now()
      }

      if (this.ID==myID) {
        post._inContextIf = [{
          _queryFailsWithout: [ '_by' ]
        }]
      } else {
        post.at = [this.ID],
        post._inContextIf = [{
          _queryFailsWithout: [ 'at.0' ]
        }]
      }

      this.posts.update(post)
      this.postContent = ''
    }
  },

  template: `
    <h1>
      <Name :ID="ID" />
    </h1>

    <p>
      <form @submit.prevent="submitPost">
        <textarea v-model="postContent" autofocus :placeholder="placeholder">
        </textarea>
        <input type="submit" value="post">
      </form>
    </p>

    <ul>
      <li class="post"
        v-for="post in posts.sortBy('-timestamp')"
        :key="post.id">
        <Post :posts="posts" :post="post"/>
      </li>
    </ul>`
}}
