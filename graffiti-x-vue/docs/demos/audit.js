export default function({myID, useCollection}) { return {

  setup: ()=> ({
    everything:
      useCollection({}, { audit: true})
  }),

  template: `
    <ul>
      <li v-for="object in everything.slice(0,5)">
        {{ JSON.stringify(object).slice(0,40) }}...
        <button @click="everything.remove(object)">
          ❌
        </button>
      </li>
    </ul>`
}}
