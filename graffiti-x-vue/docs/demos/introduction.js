import Snooper from "./snooper.js"

export default function({myID, useCollection}) { return {

  components: { Snooper: Snooper(useCollection) },

  setup: ()=> ({myID, ...useCollection({
    type: 'introduction',
    name: { $type: 'string' },
    tags: 'demo',
    // Only query for introductions made in
    // the past 24 hours
    timestamp: { $gt: Date.now() - 24*60*60*1000 }
  })}),

  data: () => ({
    name: '',
    focus: ''
  }),

  methods: {
    introduceMyself() {
      if (!this.name) return

      const myIntroductions = this.objects.filter(o=> o._by==myID)

      const myIntroduction = (!myIntroductions.length)? {
        type: 'introduction',
        tags: ['demo'],
        timestamp: Date.now()
      } : myIntroductions[0]

      myIntroduction.name = this.name
      this.update(myIntroduction)
      this.name = ''
    }
  },

  computed: {
    introductions() {
      return this.objects.sort((a, b)=> b.timestamp-a.timestamp)
    }
  },

  template: `
    <form @submit.prevent="introduceMyself">
      <input v-model="name" />
      <input type="submit" value="say hi!" />
    </form>

    <ul>
      <li v-for="introduction in introductions">
        hi, my name is {{introduction.name}}!

        <button v-if="introduction._by==myID" @click="remove(introduction)">
          ❌
        </button>

        <button @click="focus=(focus==introduction._by)?'':introduction._by">
          snoop 🕵️
        </button>

        <p v-if="focus==introduction._by">
          <Snooper :ID="introduction._by" />
        </p>
      </li>
    </ul>`
}}
