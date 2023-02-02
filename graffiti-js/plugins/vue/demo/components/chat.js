import { Name } from './name.js'

export default {

  components: { Name },

  props: ['tags', 'objects'],

  data: ()=> ({
    message: ''
  }),

  computed: {
    messages() {
      return this.objects
                 .filter(o=> 
                   'message' in o &&
                   'timestamp' in o &&
                   typeof o.message == 'string' &&
                   typeof o.timestamp == 'number')
                 .sortBy('timestamp')
    }
  },

  methods: {
    sendMessage() {
      if (!this.message) return
      this.$graffitiUpdate({
        message: this.message,
        timestamp: Date.now(),
        _tags: this.tags
      })
      this.message = ''
    }
  },

  template: `
    <ul v-for="object in messages">
      <li>
        <graffiti-objects :tags="[object._by]" v-slot="{objects}">
          <name :of="object._by" :objects="objects"></name>
        </graffiti-objects>:

        {{ object.message }}

        <template v-if="object._by==$graffitiID.value">
          <button @click="object.message+='!!';object._update()">
            ‼️
          </button>

          <button @click="object._remove()">
            ❌
          </button>
        </template>
      </li>
    </ul>

    <form @submit.prevent="sendMessage">
      <input v-model="message">
      <input type="submit" value="Submit"/>
    </form>`
}

