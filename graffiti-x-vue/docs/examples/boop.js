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
    <ol>
      <li v-for="boop in objects">
        Booped
        <button @click="remove(boop)">
          ❌
        </button>
      </li>
    </ol>`
}}
