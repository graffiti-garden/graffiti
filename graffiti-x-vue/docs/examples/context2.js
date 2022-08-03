export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    '$or': [
      { type: 'boop' },
      { tags: 'demo' }
    ],
    _by: myID
  }),

  methods: {
    makeBoopOrDemoBoop() {
      this.update({
        type: 'boop',
        tags: ['demo'],
        _inContextIf: [{
          _queryFailsWithout: [ 'type', 'tags.0' ]
        }, {
          _queryPassesWithout: [ 'type', 'tags.0' ],
          _queryFailsWithout: [ [ 'type', 'tags.0' ] ]
        }]
      })
    }
  },

  template: `
    <button @click="makeBoopOrDemoBoop">Demo Boop for Demoers and/or Boopers</button>

    <p>
      demos or boops:
      <span v-for="boop in objects">
        <a href="" @click.prevent="remove(boop)">
          boop
        </a>
      </span>
    </p>`
}}
