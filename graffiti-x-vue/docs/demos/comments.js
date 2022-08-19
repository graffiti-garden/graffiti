import Name from './name.js'

export default function({myID, useCollection}) { return {

  components: { Name: Name({useCollection}) },

  setup: ()=> ({
    comments: useCollection({
      comment: { $type: 'string' },
      about: window.location.href,
      timestamp: { $type: 'number' }
    })
  }),

  data: ()=> ({ myComment: '' }),

  methods: {
    post() {
      if (!this.myComment) return
      this.comments.update({
        comment: this.myComment,
        about: window.location.href,
        timestamp: Date.now()
      })
      this.myComment = ''
    }
  },

  template: `
    <form @submit.prevent="post">
      <input v-model="myComment"/>
      <input type="submit" value="post"/>
    </form>

    <ul>
      <li v-for="comment in comments.sortBy('-timestamp')">
        <Name :ID="comment._by" :key="comment._by" />:
        {{ comment.comment }}
        <button v-if="comment._by=='${myID}'" @click="comments.remove(comment)">
          ❌
        </button>
      </li>
    </ul>`
}}
