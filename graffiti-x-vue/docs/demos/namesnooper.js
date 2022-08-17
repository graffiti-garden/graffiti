import Snooper from './snooper.js'

export default function({useCollection}) { return {

  components: { Snooper: Snooper(useCollection) },

  setup: ()=> ({
    names: useCollection({
      name: { $type: "string" },
      timestamp: { $type: "number" }
    })
  }),

  data: () => ({ focus: '' }),

  template: `
    <ul>
      <li v-for="name in names.sortBy('-timestamp')">

        <button @click="focus=(focus==name._by)?'':name._by">
          snoop on {{name.name}}🕵️
        </button>

        <p v-if="focus==name._by">
          <Snooper :ID="name._by" />
        </p>
      </li>
    </ul>`
}}
