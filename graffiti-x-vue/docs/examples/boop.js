export default function({ myID, useQuery }) { return {

  setup: ()=> useQuery({
    type: 'boop',
    _by: myID
  }),

  template: `
    <button @click="update({
      type: 'boop',
      _inContextIf: [{}]
    })">
      Boop
    </button>
    <p v-if="objects.length">
      <span v-for="boop in objects">
        <a href="" @click.prevent="remove(boop)">
          boop
        <a/>
      </span>
    </p>`
}}
