export default {

  props: ['messageID'],

  template: `
    <GraffitiObjects v-slot="{objects}"
      :tags="[messageID]"
      :properties="{type: {enum: ['Like']}, object: {enum: [messageID]}}"
      :required="['object']">

      <button v-if="objects.mine.length" class="button-primary"
        @click="objects.removeMine()">
        👍
      </button>
      <button v-else
        @click="$graffitiUpdate({
          type: 'Like',
          object: messageID,
          tag: [this.messageID]
        })">
        👍
      </button>

      {{ objects.actors.length }}
    </GraffitiObjects>`
}
