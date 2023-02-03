export default {

  props: ['messageID'],

  methods: {
    likeObjects(objects) {
      return objects.filter(o=>
                      'like' in o &&
                      'timestamp' in o &&
                      o.like == this.messageID &&
                      typeof o.timestamp == 'number')

    },

    toggleLike(objects) {
      const myLikes = this.likeObjects(objects).mine
      if (myLikes.length) {
        myLikes.removeMine()
      } else {
        this.$graffitiUpdate({
          like: this.messageID,
          timestamp: Date.now(),
          _tags: [this.messageID]
        })
      }
    }
  },

  template: `
    <graffiti-objects :tags="[messageID]" v-slot="{objects}">
      <button @click="toggleLike(objects)" :class="likeObjects(objects).mine.length?'button-primary':''">
        👍 {{ likeObjects(objects).length }}
      </button>
    </graffiti-objects>`
}

