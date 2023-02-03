import Chat from './chat.js'
import LikeButton from './like-button.js'

export default {

  data: ()=> ({
    likeThreshold: 0,
    channel: 'demo'
  }),

  methods: {
    messageObjects: Chat.methods.messageObjects,
    likeObjects: LikeButton.methods.likeObjects,
  },

  template: `
    <p>
      Chat Channel: <input v-model="channel"/>
    </p>

    <p>
      Only show me objects with more than <input v-model.number="likeThreshold"/> likes.
    </p>

    <graffiti-objects :tags="[channel]" v-slot="{objects}">
      <ul v-for="object in messageObjects(objects)">
        <graffiti-objects :tags="[object._id]" v-slot="{objects: responses}">
          <li v-if="likeObjects(responses, object._id).length >= likeThreshold">
            <em><Name :of="object._by"/></em>:
            {{ object.message }}
          </li>
        </graffiti-objects>
      </ul>
    </graffiti-objects>`
}

