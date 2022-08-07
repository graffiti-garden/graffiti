export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    type: { $type: 'string' }
  }, { audit: true }),

  template: `
    <ol>
      <li v-for="object in objects">
        {{ object.type }}
      </li>
    </ol>`
}}
