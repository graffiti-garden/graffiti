import Vue     from 'https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.esm.browser.js'
import Theater from 'https://theater.csail.mit.edu/js/theater.js'

const stage = "the-best-feed"

const app = new Vue({
  el: '#app',
  data: {
    th: new Theater('theater.csail.mit.edu'),
    myNote: "",
    actions: []
  }
})

app.methods.postMyNote = async function() {

  const notePath = await this.th.pod.put({
    type: "Note",
    attributedTo: "~/actor",
    content: this.myNote
  }, "~/notes/#")

  const action = {
    type: "Create",
    actor: "~/actor",
    object: notePath
  }

  await this.th.perform(stage, action)
  this.myNote = ""
}

app.create = function() {
  this.th.attend.add(
    stage, 
    (_, action) => this.actions.push(action)
  )
}
