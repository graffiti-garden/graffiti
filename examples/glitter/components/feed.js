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
      console.log(followIDs)
      return { $or: [
        { _by: { $in: followIDs } },
        {  at: { $in: followIDs } }
      ]}
    }
  },

  template: `
    <p v-if="!follows.length">
      You're not following anyone!
      Browse the <router-link to="/directory">directory</router-link> for people to follow.
    </p>
    <Posts v-else :queryMod="postQueryMod" prompt="what's on your mind?"/>`
}}
