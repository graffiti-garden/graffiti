export default function({myID, useCollection}) { return {

  props: ['recipientID'],

  setup: ()=> ({myID, ...useCollection({
    type: 'boop',
    _to: myID,
    _by: myID
  })}),

  methods: {
    sendBoop() {
      this.update({
        type: 'boop',
        _to: [this.myID, this.recipientID],
        _inContextIf: [{
          _queryFailsWithout: [['_to.0', '_to.1']]
        }]
      })
    }
  },

  template: `
    <button @click="sendBoop">
      Send Boop!
    </button>

    <BoopDisplay title="boop outbox" :boops="objects" :remove="remove" />`
}}
