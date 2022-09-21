import Name from './name.js'
import Follow from './follow.js'

export default function({myID, useCollection}) { return {

  components: {
    Name: Name(...arguments),
    Follow: Follow(...arguments)
  },

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
    <ul class="directory">
      <li>
        <h1>
          <Name ID="${myID}" />
        </h1>
        <div class="modifiers">
          <input type="checkbox"
            :checked="!joins.mine.length"
            id="directorycheck"
            @change="toggleJoin">
          <label for="directorycheck">
            <template v-if="!joins.mine.length">
              add me to the directory!
            </template>
            <template v-else>
              remove me
            </template>
          </label>
        </div>
      </li>
    </ul>

    <h1>
      namebook entries:
    </h1>

    <ul>
      <li v-for="authorID in joins.authors" :key="authorID">
        <h1>
          <Name :ID="authorID" />
        </h1>
        <div class="modifiers">
          <Follow :ID="authorID" />
        </div>
      </li>
    </ul>`
}}
