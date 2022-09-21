import Posts from './posts.js'

export default function({myID, useCollection}) { return {

  components: { Posts: Posts(...arguments) },

  setup: ()=> ({
    follows: useCollection({
      "follow.by": { $type: 'string' },
      _by: myID
    })
  }),

  computed: {
    postQueryMod() {
      const followIDs = this.follows.map(f=>f.follow.by)
      return { $or: [
        { _by: { $in: followIDs } },
        {  at: { $in: followIDs } }
      ]}
    }
  },

  template: `
    <template v-if="!follows.length">
      <h1>
        You're not following anyone!
      </h1>
      <p>
      Browse the <router-link to="/directory">namebook</router-link> for people to follow.
      </p>
    </template>
    <Posts v-else :queryMod="postQueryMod" prompt="what's on your mind?" :follows="follows"/>`
}}
