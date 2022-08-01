export default function(useGraffiti) { return {

  setup: ()=> useGraffiti({
    type: 'post',
    content: { $type: 'string' },
    timestamp: { $type: 'number' },
    _by: 'f0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b'
  }),

  data: ()=> ({
    inputText: ''
  }),

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
