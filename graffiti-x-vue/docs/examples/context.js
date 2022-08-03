export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    type: 'boop',
    tags: 'demo',
    _by: myID
  }),

  methods: {
    makeDemoBoop() {
      this.update({
        type: 'boop',
        tags: ['demo']
      })
    },

    makeDemoOnlyBoop() {
      this.update({
        type: 'boop',
        tags: ['demo'],
        _inContextIf: [{
          _queryFailsWithout: ['tags.0']
        }]
      })
    }
  },

  template: `
    <button @click="makeDemoBoop">Demo Boop</button>
    <button @click="makeDemoOnlyBoop">Demo Boop for Demoers Only</button>

    <p>
      demo boops:
      <span v-for="boop in objects">
        <a href="" @click.prevent="remove(boop)">
          boop
        </a>
      </span>
    </p>`
}}
