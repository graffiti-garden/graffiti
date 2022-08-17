export default function(useCollection) { return {

  props: ['ID'],

  setup: (props)=> ({
    todos: useCollection(()=> ({
      todo: { $type: 'string' },
      _to: props.ID,
      _by: props.ID
    }))
  }),

  template: `
    <ul v-if="todos.length">
      <li v-for="todo in todos.sortBy('-timestamp')">
        {{todo.todo}}
      </li>
    </ul>
    <p v-else>
      I couldn't find anything 🧐
    </p>`
}}
