export default function({ myID, useQuery }) { return {

  setup () {
    return { myID, ...useQuery({
      type: 'post',
      content: { $type: 'string' },
      timestamp: { $type: 'number' },
      _by: myID
    }) }
  },

  data () {
    return {
      inputText: ''
    }
  },

  methods: {
    makePost() {
      this.update({
        type: 'post',
        content: this.inputText,
        timestamp: Date.now(),
        _inContextIf: [{
          _queryFailsWithout: ['_by']
        }]
      })

      // Clear the input text
      this.inputText = ''
    }
  },

  computed: {
    posts() {
      return this.objects.sort((a, b) => b.timestamp - a.timestamp)
    }
  },

  template: `
    <p>
      My user ID is: {{myID}}
    </p>
    <form @submit.prevent="makePost">
      <input v-model="inputText">
    </form>
    <ol>
      <li v-for="post in posts">
        <span>{{post.content}}</span>
        <button @click="remove(post)">
          ❌
        </button>
      </li>
    </ol>`
}}
