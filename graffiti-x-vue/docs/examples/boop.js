export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    type: 'boop',
    _by: myID
  }),

  template: `
    <button @click="update({type: 'boop'})">
      Boop
    </button>

    <p>
      boops:
      <span v-for="boop in objects">
        <a href="" @click.prevent="remove(boop)">
          boop
        </a>
      </span>
    </p>`
}}
