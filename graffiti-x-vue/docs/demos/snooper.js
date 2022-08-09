export default function(useCollection) { return {

  props: ['ID'],

  setup: (props)=> useCollection({
    todo: { $type: 'string' },
    _to: props.ID,
    _by: props.ID
  }),

  template: `
    <ul v-if="objects.length">
      <li v-for="todo in objects">
        {{todo.todo}}
      </li>
    </ul>
    <p v-else>
      I couldn't find anything 🧐
    </p>`
}}
