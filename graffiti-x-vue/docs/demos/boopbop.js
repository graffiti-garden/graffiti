export default function({myID, useCollection}) { return {

  setup: ()=> useCollection({
    type: { $in: ['boop', 'bop'] },
    _by: myID
  }),

  methods: {
    toggleType(object) {
      object.type = (object.type=='boop')? 'bop' : 'boop'
      this.update(object)
    }
  },

  template: `
    <ul v-for="type in ['boop', 'bop']">
      <li v-for="object in objects.filter(o=>o.type==type)">
        <button @click="toggleType(object)">
          {{ object.type }}
        </button>
      </li>
    </ul>`
}}

