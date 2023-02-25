import Chat from './chat.js'
import LikeButton from './like-button.js'
import { Name } from './name.js'

export default {

  data: ()=> ({
    likeThreshold: 0,
    channel: 'demo',
    admin: null
  }),

  template: `
    <p>
      Chat Channel: <input v-model="channel"/>
    </p>

    <GraffitiObjects v-slot="{objects}"
      :tags="[channel]"
      :properties="{type: {enum: ['Note']}}"
      :required="['content']">

      <h3>Example 1</h3>

      <p>
        Only show me objects with more than <input v-model.number="likeThreshold"/> likes.
      </p>

      <ul v-for="object in objects">
        <GraffitiObjects v-slot="{objects: likes}"
          :tags="[object.id]"
          :properties="{type: {enum: ['Like']}, object: { enum: [object.id] }}"
          :required="['object']">

          <li v-if="likes.length >= likeThreshold">
            <em><Name :of="object.actor"/></em>:
            {{ object.content }}
          </li>
        </GraffitiObjects>
      </ul>

      <h3>Example 2</h3>

      <p>
        Only show me objects that
        <select v-model="admin">
          <option v-for="actor in objects.actors" :value="actor">
            <Name :of="actor"/>
          </option>
        </select>
        has liked.
      </p>

      <ul v-if="admin" v-for="object in objects">
        <GraffitiObjects v-slot="{objects: likes}"
          :tags="[object.id]"
          :properties="{
            type: {enum: ['Like']},
            actor: { enum: [admin]},
            object: { enum: [object.id]}}"
          :required="['object']">
          <li v-if="likes.length">
            <em><Name :of="object.actor"/></em>:
            {{ object.content }}
          </li>
        </GraffitiObjects>
      </ul>

    </GraffitiObjects>`
}

