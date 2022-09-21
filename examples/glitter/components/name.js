export default function({myID, useCollection}) { return {

  props: ['ID'],

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
    <form v-if="editing" @submit.prevent="setName">
      <input v-model="currentName.name"
        v-click-away="()=> setName()"
        @focus="$event.target.select()" v-focus />
    </form>

    <router-link v-else :to="'/profile/' + ID">
      {{ names.length? currentName.name : 'Anonymous' }}
    </router-link>

    <button
      v-if="ID=='${myID}' && !editing"
      @click="editing=true">
      ✏️
    </button>`
}}
