export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    action: { $in: ['boop', 'bop'] },
    _by: myID
  }),

  methods: {
    toggleType(object) {
      object.action = (object.action=='boop')? 'bop' : 'boop'
      this.update(object)
    }
  },

  template: `
    <ul v-for="action in ['boop', 'bop']">
      <li v-for="object in objects.filter(o=>o.action==action)">
        <button @click="toggleType(object)">
          {{ object.action }}
        </button>
      </li>
    </ul>`
}}

