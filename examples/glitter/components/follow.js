export default function({myID, useCollection}) { return {

  props: ['ID'],
  setup: (props)=> ({
    follows: useCollection(()=>({
      follow: {
        by: props.ID
      },
      _by: myID
    }))
  }),

  methods: {
    follow() {
      if (this.follows.length) {
        this.follows.removeMine()
      } else {
        this.follows.update({
          follow: {
            by: this.ID
          }
        })
      }
    }
  },

  template: `
    <checkbox
      :id="'follow'+ID"
      :checked="follows.length"
      @click.prevent="follow">
    <label for="'follow'+ID">
      <template v-if="!follows.length">
        follow
      </template>
      <template v-else>
        unfollow
      </template>
    </label>`
}}
