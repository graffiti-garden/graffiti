import { Name } from './name.js'

export default {

  components: { Name },

  props: ['tags'],

  data: ()=> ({
    message: ''
  }),

  methods: {
    messageObjects(objects) {
      return objects.filter(o=> 
                      'message' in o &&
                      'timestamp' in o &&
                      typeof o.message == 'string' &&
                      typeof o.timestamp == 'number')
                    .sortBy('timestamp')
    },

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
    <graffiti-objects :tags="tags" v-slot="{objects}">
      <ul v-for="object in messageObjects(objects)">
        <li>
          <name :of="object._by"></name>

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
    </graffiti-objects>

    <form @submit.prevent="sendMessage">
      <input v-model="message">
      <input type="submit" value="Submit"/>
    </form>`
}

