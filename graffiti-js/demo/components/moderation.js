import Chat from './chat.js'
import LikeButton from './like-button.js'
import { Name } from './name.js'

export default {

  data: ()=> ({
    likeThreshold: 0,
    channel: 'demo',
    admin: null
  }),

  methods: {
    messageObjects: Chat.methods.messageObjects,
    likeObjects: LikeButton.methods.likeObjects,
  },

  template: `
    <p>
      Chat Channel: <input v-model="channel"/>
    </p>

    <graffiti-objects :tags="[channel]" v-slot="{objects}">

      <p>
        Only show me objects with more than <input v-model.number="likeThreshold"/> likes.
      </p>

      <ul v-for="object in messageObjects(objects)">
        <graffiti-objects :tags="[object._id]" v-slot="{objects: responses}">
          <li v-if="likeObjects(responses, object._id).length >= likeThreshold">
            <em><Name :of="object._by"/></em>:
            {{ object.message }}
          </li>
        </graffiti-objects>
      </ul>

      <p>
        Only show me objects that
        <select v-model="admin">
          <option v-for="id in objects.authors" :value="id">
            <Name :of="id">
          </option>
        </select>
        has liked.
      </p>

      <ul v-for="object in messageObjects(objects)">
        <graffiti-objects :tags="[object._id]" v-slot="{objects: responses}">
          <li v-if="likeObjects(responses, object._id).filter(o=> o._by=admin).length">
            <em><Name :of="object._by"/></em>:
            {{ object.message }}
          </li>
        </graffiti-objects>
      </ul>

    </graffiti-objects>`
}

