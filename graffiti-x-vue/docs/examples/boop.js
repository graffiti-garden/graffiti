export function Booper({myID, useCollection}) { return {
  setup: ()=> useCollection({
    type: 'boop',
    _by: myID
  }),

  template: `
    <button @click="update({type: 'boop'})">
      Boop
    </button>

    <BoopDisplay title="boops" :boops="objects" :remove="remove" />`
}}

export const BoopDisplay = {
  props: ['title', 'boops', 'remove'],

  template: `
    <p>
      {{ title }}:
      <span v-for="boop in boops">
        <a @click="remove(boop)">
          boop
        </a>
      </span>
    </p>`
}
