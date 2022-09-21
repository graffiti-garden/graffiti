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
    <input type="checkbox"
      :id="'follow'+ID"
      :checked="follows.length">
    <label for="'follow'+ID" @click.prevent="follow">
      follow<template v-if="follows.length">ed</template>
    </label>`
}}
