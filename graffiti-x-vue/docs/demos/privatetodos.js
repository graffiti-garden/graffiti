export default function({myID, useCollection}) { return {

  setup: ()=> ({
    todos: useCollection({
      todo: { $type: 'string' },
      timestamp: { $type: 'number' },
      _to: myID,
      _by: myID
    })
  }),

  data: ()=> ({ input: '' }),

  methods: {

    addTODO() {
      if (!this.input) return

      this.todos.update({
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

  template: `
    <form @submit.prevent="addTODO">
      <input v-model="input"/>
      <input type="submit" value="add to-do"/>
    </form>

    <ul>
      <li v-for="todo in todos.sortBy('-timestamp')">
        {{todo.todo}}
        <button @click="todos.remove(todo)">❌</button>
      </li>
    </ul>`
}}

