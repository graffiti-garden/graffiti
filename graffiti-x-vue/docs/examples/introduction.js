export default function({useCollection}) { return {

  setup: ()=> useCollection({
    type: 'introduction',
    name: { $type: 'string' },
    tags: 'demo',
    // Only query for introductions made in
    // the past 24 hours
    timestamp: { $gt: Date.now() - 24*60*60*1000 }
  }),

  data: () => ({
    name: '',
    focus: ''
  }),

  methods: {
    introduceMyself() {
      this.update({
        type: 'introduction',
        name: this.name,
        tags: ['demo'],
        timestamp: Date.now()
      })
    }
  },

  template: `
    <form @submit.prevent="introduceMyself">
      <input v-model="name" />
      <input type="submit" value="say hi!" />
    </form>

    <ul>
      <li v-for="introduction in objects" :key="introduction._by">
        <a @click="focus=focus==introduction._by?'':introduction._by">
          hi, my name is {{introduction.name}}!
        </a>

        <p v-if="focus==introduction._by">
          <BoopOutbox :recipientID="introduction._by" />
          <BoopInbox  :senderID   ="introduction._by" />
        </p>
      </li>
    </ul>`
}}
