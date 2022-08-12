import Name from './name.js'

export default function({myID, useCollection}) { return {

  components: { Name: Name({useCollection}) },

  setup: ()=> ({myID, ...useCollection({
    comment: { $type: 'string' },
    about: window.location.href,
    timestamp: { $type: 'number' }
  })}),

  data: ()=> ({ myComment: '' }),

  computed: {
    comments() {
      return this.objects.sort((a, b)=> b.timestamp-a.timestamp)
    }
  },

  methods: {
    post() {
      this.update({
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
      <li v-for="comment in comments">
        <Name :ID="comment._by" />:
        {{ comment.comment }}
        <button v-if="comment._by==myID" @click="remove(comment)">
          ❌
        </button>
      </li>
    </ul>`
}}
