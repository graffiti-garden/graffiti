import Logoot from '../../graffiti-x-js/logoot.js'
import OrderTODOs from './ordertodos.js'

export default function({myID, useCollection}) { return {

  components: { OrderTODOs },

  setup: ()=> ({
    todos: useCollection({
      todo: { $type: 'string' },
      ...Logoot.query('order'),
      _by: myID
    })
  }),

  methods: {
    addTODO() {
      if (!this.input) return

      this.todos.update({
        todo: this.input,
        order: Logoot.between(
          Logoot.before,
          // Place it at the beginning of the list
          this.todos.length?
            this.todos.reduce((a, b)=> 
              Logoot.compare(a.order, b.order)>0? b : a).order
            : Logoot.after)
      })

      this.input = ''
    },
  },

  computed: {
    oddTODOs() {
      return this.todos.filter(o=> o.todo.length%2==0)
    }
  },

  template: `
    <form @submit.prevent="addTODO">
      <input v-model="input"/>
      <input type="submit" value="add to-do"/>
    </form>

    <div class="columns">
      <OrderTODOs :todos="todos"/>
      <OrderTODOs :todos="oddTODOs"/>
    </div>`

}}
