export default function({myID, useCollection}) { return {

  setup: ()=> ({myID, ...useCollection({
    type: 'boop',
    _to: myID,
    _by: myID
  })}),

  data: ()=> ({
    recipientID: ''
  }),

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
    Recipient ID: <input v-model="recipientID" />

    <button @click="sendBoop()">
      Send Boop!
    </button>

    <BoopDisplay title="boop outbox" :boops="objects" :remove="remove" />`
}}
