export default function({myID, useCollection}) { return {

  props: ['ID', 'editable'],

  setup: (props)=> ({
    names: useCollection(()=>({
      name: { $type: 'string' },
      timestamp: { $type: 'number' },
      _by: props.ID
    }))
  }),

  data: ()=> ({ editing: false }),

  computed: {
    currentName() {
      return this.names.length?
        this.names.sortBy('-timestamp')[0] : {
          name: '',
          _inContextIf: [{
            _queryFailsWithout: [ '_by' ]
          }]
        }
    },

    currentNameDisplay() {
      return this.names.length?
        this.currentName.name :
        'Anonymous'
    }
  },

  methods: {
    setName() {
      if (!this.currentName.name) return

      this.currentName.timestamp = Date.now()
      this.names.update(this.currentName)
      this.editing = false
    }
  },

  template: `
    <template v-if="editable && ID=='${myID}'">
      <form v-if="editing" @submit.prevent="setName">
        <input v-model="currentName.name"
          v-click-away="()=> setName()"
          @focus="$event.target.select()" v-focus />
      </form>
      <button v-else @click="editing=true">
        {{ currentNameDisplay }}
      </button>
    </template>
    <template v-else>
      <router-link :to="'/profile/' + ID">
        {{ currentNameDisplay }}
      </router-link>
    </template>`
}}
