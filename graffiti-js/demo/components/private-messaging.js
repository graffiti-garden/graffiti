import Chat from './chat.js'
import {Name} from './name.js'

export default {

  data: ()=> ({
    recipient: null,
    message: ''
  }),

  methods: {
    messageObjects: Chat.methods.messageObjects,
    chatObjects(objects) {
      return this.messageObjects(objects).filter(o=>
        '_to' in o && o._to.length == 1)
    },

    sendMessage() {
      if (!this.message) return
      this.$graffitiUpdate({
        message: this.message,
        timestamp: Date.now(),
        _to: [this.recipient],
        _tags: [this.$graffitiMyID, this.recipient]
      })
      this.message = ''
    }
  },

  template: `
    Send private message to:
    <graffiti-objects :tags="['demo']" v-slot="{objects}">
      <select v-model="recipient">
        <option v-for="id in objects.notMine.authors" :value="id">
          <Name :of="id">
        </option>
      </select>
    </graffiti-objects>

    <form @submit.prevent="sendMessage">
      <input v-model="message">
      <input type="submit" value="Submit"/>
    </form>

    <graffiti-objects :tags="[$graffitiMyID]" v-slot="{objects}">

      <h3>My Outbox</h3>

      <ul v-for="object in chatObjects(objects).mine">
        <li>
          To <em><Name :of="object._to[0]"/></em>:
          {{ object.message }}
        </li>
      </ul>

      <h3>My Inbox</h3>

      <ul v-for="object in chatObjects(objects).notMine">
        <li>
          From <em><Name :of="object._by"/></em>:
          {{ object.message }}
        </li>
      </ul>

    </graffiti-objects>`
}
