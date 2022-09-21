import Post from './post.js'

export default function({myID, useCollection}) { return {

  name: 'Posts',

  components: {
    Post: Post(...arguments)
  },

  props: ['queryMod', 'postMod', 'prompt', 'follows', 'inReplyToContentAddress'],

  setup: (props)=> ({
    posts: useCollection(()=>Object.assign({
      post: { $type: 'string' },
      id: { $type: 'string' },
      timestamp: { $type: 'number' },
    }, props.queryMod))
  }),

  data: ()=> ({ postContent: '' }),

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
  },

  template: `
    <form @submit.prevent="submitPost">
      <textarea v-model="postContent" autofocus :placeholder="prompt" />
      <input type="submit" value="post">
    </form>


    <ul>
      <li v-for="post in posts.sortBy('-timestamp')" :key="post.id">
        <Post :post="post" :follows="follows" :inReplyToContentAddress="inReplyToContentAddress"/>
      </li>
    </ul>`
}}
