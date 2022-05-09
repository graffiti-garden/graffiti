import GraffitiTools from './vanilla.js'

export default function GraffitiComponents(vue, graffitiURL='https://graffiti.csail.mit.edu') {

  const graffiti = new GraffitiTools(graffitiURL)
  const falseID = Math.random().toString(36).substr(2)

  const GraffitiLogin = {
    data: () => ({
      loggedIn: false,
      myID: falseID
    }),

    async created() {
      // Wait for login
      // (note that this won't necessarily load
      //  before creation, hence the false ID)
      this.loggedIn = await graffiti.loggedIn()
      this.myID = await graffiti.myID()
    },

    methods: {

      logIn() {
        graffiti.logIn()
      },

      logOut() {
        graffiti.logOut()
      },

    },

    template: `
    <div class="graffiti-log-in-bar">
      <template v-if="loggedIn">
        <button class="graffiti-log-in-button" @click="logOut">log out of graffiti</button>
      </template>
      <template v-else>
        <button class="graffiti-log-in-button" @click="logIn">log in to graffiti</button>
      </template>
    </div>

    <slot
      :logOut        = "logOut"
      :logIn         = "logIn"
      :loggedIn      = "loggedIn"
      :myID          = "myID"
    ></slot>
    `
  }

  const GraffitiCollection = {

    props: {

      // The query applied to objects in the collection
      query: {
        type: Object,
        default: () => ({})
      },

      // How many objects should be
      // pre-loaded from the start
      pageSize: {
        type: Number,
        default: 1,
      },

      // The way that objects are sorted
      sort: {
        type: Function,
        // by default newest -> oldest
        // so that objects[0] is the newest
        default: function(a, b) {
          return b._timestamp - a._timestamp
        },
      },

      // Will the objects be synchronized
      // live or only updated in response
      // to manual edits or fetches
      live: {
        type: Boolean,
        default: false
      },
    },

    data: () => ({
      canRewind: true,
    }),

    computed: {
      // Objects sorted by the sort function
      objects() {
        return Object.values(this.objectMap).sort(this.sort)
      },
    },

    setup(props) {
      // Create an object full of results
      const objectMap = vue.reactive({})

      // Begin subscribing to an object
      const querySubscriber = graffiti.QuerySubscriber(objectMap, props.live)
      // Make sure it will disconnect appropriately
      vue.onBeforeUnmount(querySubscriber.delete)

      return { objectMap, querySubscriber }
    },

    watch: {
      query: {
        handler: async function(newQuery, oldQuery) {
          // Don't update if the query hasn't actually changed
          // (it can get triggered twice because of immediate)
          const newQueryJSON = JSON.stringify(newQuery)
          const oldQueryJSON = JSON.stringify(oldQuery)
          if (newQueryJSON == oldQueryJSON) return

          // If the query includes the random string, continue.
          // The query will update after login
          if (newQueryJSON.includes(falseID)) return

          // Update the query and rewind
          await this.querySubscriber.update(newQuery)
          await this.rewind()
        },
        deep: true,
        immediate: true
      },
    },

    methods: {
      async rewind(pageSize=null) {
        if (pageSize == null) pageSize = this.pageSize
        this.canRewind = await this.querySubscriber.rewind(pageSize)
        return this.canRewind
      },

      async play(pageSize=null) {
        if (pageSize == null) pageSize = this.pageSize
        return await this.querySubscriber.play(pageSize)
      },

      async update(object) {
        // Send it to the server
        const id = await graffiti.update(object)

        // Then make sure it is returned in the query
        const output = await graffiti.queryOne({ "$and": [
          this.query,
          { _id: id }
        ]})

        if (!output) {
          await graffiti.delete(id)
          throw {
            type: 'Error',
            content: 'Tried to update an object, but it would not be included in this collection\'s query.',
            object: object,
            query: this.query
          }
        } else {
          this.objectMap[id] = output
        }
      },

      async delete_(id) {
        if (!(id in this.objectMap)) {
          throw {
            type: 'Error',
            content: 'An ID was supposed to be deleted, but it is not in this collection',
            id: id
          }
        }
        await graffiti.delete(id)
        delete this.objectMap[id]
      },
    },

    // Fill the inside with whatever
    template: `
    <slot
      :object        = "objects[0]"
      :objects       = "objects"
      :update        = "update"
      :delete        = "delete_"
      :play          = "play"
      :rewind        = "rewind"
      :canRewind     = "canRewind"
    ></slot>`
  }

  return { 
    'graffiti-login': GraffitiLogin, 
    'graffiti-collection': GraffitiCollection 
  }
}

class GraffitiApp extends HTMLElement {
  constructor() {
    super();

    // Get the data
    const dataStr = this.getAttribute('data');
    let data = {}
    if (dataStr) {
      data = JSON.parse(dataStr)
    }

    let graffitiURL = this.getAttribute('graffitiURL')
    if (!graffitiURL) {
      graffitiURL = 'https://graffiti.csail.mit.edu'
    }

    // Create the app
    const app = Vue.createApp({
      components: GraffitiComponents(Vue, graffitiURL),
      data: () => (data)
    })

    // Create a place for it to go
    const shadow = this.attachShadow({mode: 'open'})
    const appEl = document.createElement('div')
    const graffitiLogin = document.createElement('graffiti-login')
    graffitiLogin.setAttribute('v-slot', 'graffiti')
    graffitiLogin.innerHTML = this.innerHTML
    this.innerHTML = ""

    // Mount
    appEl.appendChild(graffitiLogin)
    shadow.appendChild(appEl)
    app.mount(appEl)
  }
}
customElements.define('graffiti-app', GraffitiApp)
