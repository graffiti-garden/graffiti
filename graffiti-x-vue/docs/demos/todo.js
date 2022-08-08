import Logoot from '../../graffiti-x-js/logoot.js'

export default function({myID, useCollection}) { return {

  // Initialize a query for todos
  // including a property "order" that
  // adheres to the Logoot spec.
  setup: ()=> useCollection({
    todo: { $type: 'string' },
    ...Logoot.query('order'),
    _by: myID
  }),

  // Sort the queried objects by their
  // order property according to the Logoot
  // compare function
  computed: {
    todos() {
      return this.objects.sort((a, b)=> Logoot.compare(a.order, b.order))
    }
  },

  data: ()=> ({
    input: '',
    dragging: null
  }),

  methods: {
    addTODO() {
      // If there is no input text, don't do anything
      if (!this.input) return

      // Add the TODO
      this.update({
        todo: this.input,
        // position it between the start of the list,
        // Logoot.before, and either the first element
        // if it exists or the end of the list, Logoot.after
        order: Logoot.between(
          Logoot.before,
          this.todos.length? this.todos[0].order : Logoot.after)
      })

      // Clear the input
      this.input = ''
    },

    // Store the todo that was clicked
    // when a drag begins
    dragstart(todo) {
      this.dragging = todo
    },

    drop(todoIndex) {
      // Set position of the stored TODO
      // to be between the element it is dropped on
      // and either the preceding element if it exists
      // or the start of the list, Logoot.before
      this.dragging.order = Logoot.between(
        todoIndex? this.todos[todoIndex-1].order : Logoot.before,
        this.todos[todoIndex].order)
      this.update(this.dragging)
    }
  },

  template: `
    <form @submit.prevent="addTODO">
      <input v-model="input"/>
      <input type="submit" value="add todo"/>
    </form>
    
    <ol>
      <li v-for="(todo, todoIndex) in todos"
       draggable="true"
       @dragstart="dragstart(todo)"
       @drop="drop(todoIndex)"
       @dragover.prevent
       @dragenter.prevent>
        {{todo.todo}}
        <button @click="remove(todo)">❌</button>
      </li>
    </ol>`
}}
