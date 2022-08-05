export default function({myID, useCollection}) { return {
  setup: ()=> useCollection({
    type: 'notboop',
    _by: myID
  }),

  template: `
    <button @click="update({type: 'boop'})">
      This Won't Work
    </button>

    <BoopDisplay title="not boops" :boops="objects" :remove="remove" />`
}}
