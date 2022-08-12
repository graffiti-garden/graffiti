export default function({useCollection}) { return {

  props: ['ID', 'editable'],

  setup: (props)=> useCollection({
    name: { $type: "string" },
    timestamp: { $type: "number" },
    _by: props.ID
  }),

  computed: {
    names() {
      return this.objects.sort((a, b)=> b.timestamp-a.timestamp)
    },
    currentName() {
      return this.names.length? this.names[0] : { name: '' }
    }
  },

  data: ()=> ({ editing: false }),

  methods: {
    saveName() {
      this.currentName.timestamp = Date.now()
      this.update(this.currentName)
      this.editing = false
    }
  },

  template: `
    <template v-if="!editing">
      <template v-if="currentName.name">
        {{ currentName.name }}
      </template>
      <template v-else>
        anonymous
      </template>

      <button v-if="editable" @click="editing=true">
        ✏️
      </button>
    </template>

    <form v-else @submit.prevent="saveName">
      <input v-model="currentName.name"/>
      <input type="submit" value="✅"/>
    </form>`
}}
