import Chat from './chat.js'
import {Name} from './name.js'

export default {

  data: ()=> ({
    recipient: null,
    message: ''
  }),

  methods: {
    sendMessage() {
      if (!this.message || !this.recipient) return
      this.$graffitiUpdate({
        type: 'Note',
        content: this.message,
        bto: [this.recipient],
        tag: [this.$graffitiMyActor, this.recipient]
      })
      this.message = ''
    }
  },

  template: `
    Send private message to:
    <GraffitiObjects v-slot="{objects}"
      :tags="['demo']"
      :mine="false">

      <select v-model="recipient">
        <option v-for="actor in objects.actors" :value="actor">
          <Name :of="actor"/>
        </option>
      </select>
    </GraffitiObjects>

    <form @submit.prevent="sendMessage">
      <input v-model="message">
      <input type="submit" value="Submit"/>
    </form>

    <GraffitiObjects v-slot="{objects}"
      :tags="[$graffitiMyActor]"
      :properties="{type: {enum: ['Note']}}"
      :required="['content','bto']">

      <h3>My Outbox</h3>

      <ul v-for="object in objects.mine">
        <li>
          To <em><Name :of="object.bto[0]"/></em>:
          {{ object.content }}
        </li>
      </ul>

      <h3>My Inbox</h3>

      <ul v-for="object in objects.notMine">
        <li>
          From <em><Name :of="object.actor"/></em>:
          {{ object.content }}
        </li>
      </ul>

    </GraffitiObjects>`
}
