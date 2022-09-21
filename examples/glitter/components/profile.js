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

    prompt() {
      return this.ID==myID?
        "what's on your mind?" :
        "to my dear friend..."
    }
  },

  template: `
    <h1>
      <Name :ID="ID" />
    </h1>
    <h2>
      <Follow :ID="ID" />
    </h2>

    <Posts :query="queryMod" :prompt="prompt"/>`
}}
