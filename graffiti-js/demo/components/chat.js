import { Name } from './name.js'
import LikeButton from './like-button.js'

export default {

  components: { Name, LikeButton },

  data: ()=> ({
    message: '',
    channel: 'demo'
  }),

  methods: {

    sendMessage() {
      if (!this.message) return
      this.$graffitiUpdate({
        type: 'Note',
        content: this.message,
        tag: [this.channel]
      })
      this.message = ''
    }
  },

  template: `
    <p>
      Chat Channel: <input v-model="channel"/>
    </p>

    <GraffitiObjects v-slot="{objects}"
      :tags="[channel]"
      :properties="{type: { enum: ['Note'] }}"
      :required="['content']"
      sortBy="published">

      <ul v-for="object in objects">
        <li>
          <em><Name :of="object.actor"/></em>:
          {{ object.content }}

          <LikeButton :messageID="object.id" />

          <template v-if="object.actor==$graffitiMyActor">
            <button @click="object.content+='!!'">
              ‼️
            </button>

            <button @click="delete object.id">
              ❌
            </button>
          </template>
        </li>
      </ul>
    </GraffitiObjects>

    <form @submit.prevent="sendMessage">
      <input v-model="message">
      <input type="submit" value="Submit"/>
    </form>`
}
