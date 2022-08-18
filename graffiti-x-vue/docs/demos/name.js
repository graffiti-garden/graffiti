export default function({useCollection}) { return {

  props: ['ID', 'editable'],

  setup: (props)=> ({
    names: useCollection(()=> ({
      name: { $type: "string" },
      timestamp: { $type: "number" },
      _by: props.ID
    }))
  }),

  computed: {
    currentName() {
      return this.names.length?
        this.names.sortBy('-timestamp')[0] :
        { name: '' }
    }
  },

  data: ()=> ({ editing: false }),

  methods: {
    saveName() {
      this.currentName.timestamp = Date.now()
      this.names.update(this.currentName)
      this.editing = false
    }
  },

  template: `
    <template v-if="!editing">
      {{ names.length? currentName.name : 'anonymous' }}
      <button v-if="editable" @click="editing=true">
        ✏️
      </button>
    </template>

    <form v-else @submit.prevent="saveName">
      <input v-model="currentName.name"/>
      <input type="submit" value="✅"/>
    </form>`
}}
