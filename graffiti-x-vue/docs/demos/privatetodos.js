export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    todo: { $type: 'string' },
    timestamp: { $type: 'number' },
    _to: myID,
    _by: myID
  }),

  methods: {

    addTODO() {
      if (!this.input) return

      this.update({
        todo: this.input,
        timestamp: Date.now(),
        _to: [myID],
        _inContextIf: [{
          _queryFailsWithout: ["_to.0"]
        }]
      })

      this.input = ''
    },
  },

  computed: {
    todos() {
      return this.objects.sort((a, b)=> b.timestamp-a.timestamp)
    }
  },

  template: `
    <form @submit.prevent="addTODO">
      <input v-model="input"/>
      <input type="submit" value="add todo"/>
    </form>

    <ul>
      <li v-for="todo in todos">
        {{todo.todo}}
        <button @click="remove(todo)">❌</button>
      </li>
    </ul>`
}}

