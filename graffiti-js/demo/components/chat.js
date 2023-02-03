import { Name } from './name.js'
import LikeButton from './like-button.js'

export default {

  components: { Name, LikeButton },

  data: ()=> ({
    message: '',
    channel: 'demo'
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
        _tags: [this.channel]
      })
      this.message = ''
    }
  },

  template: `
    <p>
      Chat Channel: <input v-model="channel"/>
    </p>

    <graffiti-objects :tags="[channel]" v-slot="{objects}">
      <ul v-for="object in messageObjects(objects)">
        <li>
          <em><Name :of="object._by"/></em>:
          {{ object.message }}

          <LikeButton :messageID="object._id" />

          <template v-if="object._by==$graffitiMyID">
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

