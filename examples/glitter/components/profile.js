import Name from './name.js'
import Follow from './follow.js'
import Posts from './posts.js'

export default function({myID, useCollection}) { return {

  components: {
    Name: Name(...arguments),
    Follow: Follow(...arguments),
    Posts: Posts(...arguments)
  },

  props: ['ID'],

  computed: {
    queryMod() {
      return { $or: [
        { _by: this.ID },
        { at: this.ID }
      ]}
    },

    postMod() {
      return this.ID==myID? {} : {
        at: [this.ID],
        _inContextIf: [{
          _queryFailsWithout: ['at.0']
        }]
      }
    },

    prompt() {
      return this.ID==myID?
        "what's on your mind?" :
        "to my dear friend..."
    }
  },

  template: `
    <h1>
      <Name :ID="ID" editable="true"/>
    </h1>
    <p v-if="ID!='${myID}'">
      <Follow :ID="ID" />
    </p>

    <Posts :queryMod="queryMod" :postMod="postMod" :prompt="prompt"/>`
}}
