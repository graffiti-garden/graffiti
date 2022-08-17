export default function({myID, useCollection}) { return {

  setup: ()=> ({
    boops: useCollection({
      action: 'boop',
      _by: myID
    })
  }),

  template: `
    <button @click="boops.update({action: 'boop'})">
      Boop
    </button>

    <p>
      <span  v-for="boop in boops">
        boop
        <button @click="boops.remove(boop)">❌</button>
      </span>
    </p>`
}}
