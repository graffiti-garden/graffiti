import Logoot from '../../graffiti-x-js/logoot.js'

export default {

  props: ['todos'],

  computed: {
    todosSorted() {
      return this.todos.sort((a, b)=> Logoot.compare(a.order, b.order))
    }
  },

  methods: {
    move(todo, index, offset) {
      let newIndex = index + offset
      if (newIndex < 0 || newIndex > this.todosSorted.length-1) return

      if (offset > 0) newIndex++

      todo.order = Logoot.between(
        (newIndex == 0)? Logoot.before : this.todosSorted[newIndex-1].order,
        (newIndex == this.todosSorted.length)? Logoot.after : this.todosSorted[newIndex].order)

      this.todos.update(todo)
    },
  },

  template: `
    <ol>
      <li v-for="(todo, index) in todosSorted">
        {{todo.todo}}
        <button @click="move(todo, index, -1)">👆</button>
        <button @click="move(todo, index, +1)">👇</button>
        <button @click="todos.remove(todo)">❌</button>
      </li>
    </ol>`
}
