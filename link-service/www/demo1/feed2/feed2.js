import Vue     from 'https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.esm.browser.js'
import Theater from 'https://theater.csail.mit.edu/js/theater.js'

const stage = "a-generic-feed"

const app = new Vue({
  el: '#app',
  data: {
    th: new Theater('theater.csail.mit.edu'),
    myActor: "",
    notes: {},
    likes: {},
    rankedNotes: []
  },

  created: function() {

    this.th.hash("~/actor").then(
      hash => {this.myActor = hash}
    )

    this.th.attend.add(
      stage, 
      (stage, action) => {

        if (action.type == "Create") {
          if (action.object.type == "Note") {
            const note = action.object
            this.notes[note.id] = {
              note: note,
              actors: new Set(),
              actorsToLikes: {},
            }
            note.likes = 0
            this.rankedNotes.push(note)
          }
        }

        if (action.type == "Like") {
          if (action.object.id in this.notes) {
            const likeID = action.id
            const noteID = action.object.id
            const actorID = action.actor.id

            // Don't allow double liking
            if (!this.notes[noteID].actors.has(actorID)) {
              this.notes[noteID].actors.add(actorID)
              this.notes[noteID].actorsToLikes[actorID] = likeID
              this.likes[likeID] = action

              const rank = this.rankedNotes.findIndex(note => note.id == noteID)
              this.rankedNotes[rank].likes += 1
            }
          }
        }

        if (action.type == "Undo") {
          if (action.object.id in this.likes) {
            const likeID = action.object.id
            const noteID = this.likes[likeID].object.id
            const actorID = action.actor.id

            // Don't allow undoing someone else's like
            if (actorID == this.likes[likeID].actor.id) {
              this.notes[noteID].actors.delete(actorID)
              delete this.notes[noteID].actorsToLikes[actorID]
              delete this.likes[likeID]

              const rank = this.rankedNotes.findIndex(note => note.id == noteID)
              this.rankedNotes[rank].likes -= 1
            }
          }
        }

        // Sort by number of likes
        this.rankedNotes.sort((a, b) => b.likes - a.likes)
      }
    )
  },

  methods: {

    like: async function(noteID) {

      const myLike = {
        type: "Like",
        actor: "~/actor",
        object: {id: noteID}
      }

      await this.th.perform(stage, myLike)

    },

    unlike: async function(noteID) {

      if (noteID in this.notes) {
        if (this.notes[noteID].actors.has(this.myActor)) {
          const likeID = this.notes[noteID].actorsToLikes[this.myActor]

          const myUnlike = {
            type: "Undo",
            actor: "~/actor",
            object: {id: likeID}
          }

          await this.th.perform(stage, myUnlike)
        }
      }

    }

  },
})
