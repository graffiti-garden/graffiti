export default function({myID, useCollection}) { return {

  props: ['ID'],
  setup: (props)=> ({
    likes : useCollection(()=>({
      'like.id': props.ID
    }))
  }),

  methods: {
    toggleLike() {
      if (this.likes.mine.length) {
        this.likes.removeMine()
      } else {
        this.likes.update({
          like: { id: this.ID },
          _inContextIf: [{
            _queryFailsWithout: ['like.id']
          }]
        })
      }
    }
  },

  template: `
    <input type="checkbox"
      :id="'like' + ID"
      :checked="likes.mine.length">
    <label :for="'like' + ID" @click.prevent="toggleLike">
      👍 like<template v-if="likes.mine.length">d</template>
    </label>
    <label disabled>
      likes: {{ likes.authors.length }}
    </label>`
  }
}
