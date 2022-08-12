export default function({myID, useCollection}) { return {
  setup: ()=> useCollection({
    action: 'boop',
    _by: myID
  }),

  template: `
    <button @click="update({action: 'boop'})">
      Boop
    </button>

    <p>
      <span  v-for="boop in objects">
        boop
        <button @click="remove(boop)">❌</button>
      </span>
    </p>`
}}
