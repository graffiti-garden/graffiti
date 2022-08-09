export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({}, { audit: true }),

  template: `
    <ul>
      <li v-for="object in objects.slice(0,5)">
        {{ JSON.stringify(object).slice(0,40) }}...
        <button @click="remove(object)">
          ❌
        </button>
      </li>
    </ul>`
}}
