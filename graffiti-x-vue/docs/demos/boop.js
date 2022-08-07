export default function({myID, useCollection}) { return {
  setup: ()=> useCollection({
    type: 'boop',
    _by: myID
  }),

  template: `
    <button @click="update({type: 'boop'})">
      Boop
    </button>

    <BoopDisplay title="boops" :boops="objects" :remove="remove" />`,
}}
