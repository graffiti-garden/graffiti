import Logoot from '../../graffiti-x-js/logoot.js'

export default {

  props: ['update', 'remove', 'objects'],

  computed: {
    sorted() {
      return this.objects.sort((a, b)=> Logoot.compare(a.order, b.order))
    }
  },

  methods: {
    move(object, index, offset) {
      let newIndex = index + offset
      if (newIndex < 0 || newIndex > this.sorted.length-1) return

      if (offset > 0) newIndex++

      object.order = Logoot.between(
        (newIndex == 0)? Logoot.before : this.sorted[newIndex-1].order,
        (newIndex == this.sorted.length)? Logoot.after : this.sorted[newIndex].order)

      this.update(object)
    },
  },

  template: `
    <ol>
      <li v-for="(object, index) in sorted">
        {{object.todo}}
        <button @click="move(object, index, -1)">👆</button>
        <button @click="move(object, index, +1)">👇</button>
        <button @click="remove(object)">❌</button>
      </li>
    </ol>`
}
