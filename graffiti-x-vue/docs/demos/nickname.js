export default function({myID, useCollection}) { return {

  setup: ()=> ({
    nicknames: useCollection({
      name: { $type: "string" },
      timestamp: { $type: "number" },
      tags: 'graffiti-demo',
      _by: myID
    })
  }),

  data: ()=> ({
    nickname: '',
    contextualBoundary: true
  }),

  methods: {
    saveNickname() {
      // Remove all previous nicknames
      // with a helper function
      this.nicknames.removeMine()

      const nicknameObj = {
        name: this.nickname,
        tags: ['graffiti-demo'],
        timestamp: Date.now()
      }

      if (this.contextualBoundary) {
        nicknameObj._inContextIf = [{
          _queryFailsWithout: [ 'tags.0' ]
        }]
      }

      this.nicknames.update(nicknameObj)
    }
  },

  template: `
    <form v-else @submit.prevent="saveNickname">
      <input v-model="nickname" />
      <input type="checkbox" id="checkbox" v-model="contextualBoundary" />
      <label for="checkbox">add contextual boundary?</label>
      <input type="submit" value="replace nickname"/>
    </form>

    <p v-if="nicknames.length">
      my nickname is: {{ nicknames.sortBy('-timestamp')[0].name }}
    </p>
    <p v-else>
      i don't have a nickname 😭
    </p>`
}}
