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

  methods: {
    // These functions move a TODO at a particular
    // index up or down. They replace that TODO's
    // order with something in-between either the
    // two TODOs preceding or following with virtual
    // TODOs at very beginning and very end represented
    // with Logoot.before and Logoot.after.
    moveUp(index) {
      if (index == 0) return
      this.todos[index].order = Logoot.between(
        (index > 1)? this.todos[index-2].order : Logoot.before,
        this.todos[index-1].order)
      this.update(this.todos[index-1])
    },
    moveDown(index) {
      if (index == this.todos.length - 1) return
      this.todos[index].order = Logoot.between(
        this.todos[index+1].order,
        (index < this.todos.length-2)? this.todos[index+2].order : Logoot.after)
      this.update(this.todos[index+1])
    },

    // A function to create a new TODO
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
  },

  data: ()=> ({input: ''}),

  template: `
    <form @submit.prevent="addTODO">
      <input v-model="input"/>
      <input type="submit" value="add todo"/>
    </form>
    
    <ol>
      <li v-for="(todo, todoIndex) in todos">
        {{todo.todo}}
        <button @click="moveUp(todoIndex)">👆</button>
        <button @click="moveDown(todoIndex)">👇</button>
        <button @click="remove(todo)">❌</button>
      </li>
    </ol>`
}}
