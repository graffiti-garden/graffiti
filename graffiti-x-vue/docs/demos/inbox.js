export default function({myID, useCollection}) { return {

  props: ['senderID'],

  setup: (props)=> useCollection({
    type: 'boop',
    _to: myID,
    _by: props.senderID
  }),

  template: `
    <BoopDisplay title="boop inbox" :boops="objects" :remove="remove" />`

}}
