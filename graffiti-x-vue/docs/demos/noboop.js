export default function({myID, useCollection}) { return {
  setup: ()=> useCollection({
    type: 'notboop',
    _by: myID
  }),

  template: `
    <button @click="update({type: 'boop'})">
      This Won't Work
    </button>

    <p v-if="objects.length">
      boop
    </p>`
}}
