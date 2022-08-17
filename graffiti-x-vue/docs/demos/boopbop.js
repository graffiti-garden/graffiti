export default function({myID, useCollection}) { return {

  setup: ()=> ({
    boopbops: useCollection({
      action: { $in: ['boop', 'bop'] },
      _by: myID
    })
  }),

  methods: {
    toggleType(boopbop) {
      boopbop.action = boopbop.action=='boop'? 'bop' : 'boop'
      this.boopbops.update(boopbop)
    }
  },

  template: `
    <ul v-for="action in ['boop', 'bop']">
      <li v-for="boopbop in boopbops.filter(o=>o.action==action)">
        <button @click="toggleType(boopbop)">
          {{ boopbop.action }}
        </button>
      </li>
    </ul>`
}}
