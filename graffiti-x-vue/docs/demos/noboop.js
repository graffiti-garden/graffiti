export default function({myID, useCollection}) { return {

  setup: ()=> ({
    notboops: useCollection({
      type: 'notboop',
      _by: myID
    })
  }),

  template: `
    <button @click="notboops.update({type: 'boop'})">
      This Won't Work
    </button>

    <p v-if="notboops.length">
      boop
    </p>`
}}
