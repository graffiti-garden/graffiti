export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    type: 'boop',
    _to: myID,
    _by: { $ne: myID }
  }),

  template: `
    <BoopDisplay title="boop inbox" :boops="objects" :remove="remove" />`

}}
