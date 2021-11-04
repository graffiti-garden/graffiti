import Vue     from 'https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.esm.browser.js'
import Theater from 'https://theater.csail.mit.edu/js/theater.js'

const stage = "a-generic-feed"

const app = new Vue({
  el: '#app',
  data: {
    th: new Theater('theater.csail.mit.edu'),
    actions: [],
    myNote: "",
  },

  created: function() {

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
      }, "~/notes/")

      const action = {
        type: "Create",
        actor: "~/actor",
        object: myPodNote.path
      }

      await this.th.perform(stage, action)
      this.myNote = ""

    },

  },
})
