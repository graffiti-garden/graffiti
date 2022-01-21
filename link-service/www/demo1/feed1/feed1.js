import Vue     from 'https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.esm.browser.js'
import Theater from '/js/theater.js'

const stage = "a_generic_feed"

const app = new Vue({
  el: '#app',
  data: {
    th: new Theater(window.location.origin),
    actions: [],
    myNote: "",
  },

  created: function() {
    this.actor = this.th.put({
      content
    })

    this.th.attend.add(
      stage, 
      (stage, action) => this.actions.unshift(action)
    )
  },

  methods: {

    postMyNote: async function() {

      const myPodNote = await this.th.put({
        type: "Note",
        content: this.myNote
      })

      const action = {
        type: "Create",
        actor: "~/actor",
        object: myPodNote
      }

      await this.th.perform(stage, action)
      this.myNote = ""

    },

  },
})

// Write a Vuejs plugin to do the following:
//
// Objects are reactive components. I.e. if an object is a placeholder and it's contents change, it and it's dependencies will change as well.
// There is also an object cache so that 
// Create a cache
// ID -> thing
// Have lazy expansion with getter/setter object
//
// await myPodNote.object
// Will fetch things from the cache or get them from the network
// If it is a placeholder it will attend and dynamically update
// can this be reactive?
