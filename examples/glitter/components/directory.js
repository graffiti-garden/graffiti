import Name from './name.js'

export default function({myID, useCollection}) { return {

  components: { Name: Name(...arguments) },

  setup: ()=> ({
    joins: useCollection({
      action: 'join',
      space: 'namebook'
    })
  }),

  methods: {
    toggleJoin() {
      if (this.joins.mine.length) {
        this.joins.removeMine()
      } else {
        this.joins.update({
          action: 'join',
          space: 'namebook',
          _inContextIf: [{
            '_queryFailsWithout': [ 'space' ]
          }]
        })
      }
    }
  },

  template: `
    <h1>
      <u>
        namebook directory
      </u>
    </h1>

    <h2>
      <input type="checkbox"
        :checked="joins.mine.length"
        id="directorycheck"
        @change="toggleJoin">
      <label for="directorycheck">
        <template v-if="!joins.mine.length">
          add me!
        </template>
        <template v-else>
          remove me
        </template>
      </label>
    </h2>

    <ul class="directory">
      <li v-for="authorID in joins.authors" :key="authorID">
        <h3>
          <Name :ID="authorID" />
        </h3>
      </li>
    </ul>`
}}
