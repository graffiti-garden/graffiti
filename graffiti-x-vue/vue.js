import GraffitiAuth   from './auth.js'
import GraffitiSocket from './socket.js'

const falseID = Math.random().toString(36).substr(2)

function GraffitiLogin(auth) { return {
  data: () => ({
    loggedIn: false,
    myID: falseID
  }),

  created: async function() {
    // Wait for login
    this.loggedIn = await auth.loggedIn()
    this.myID = await auth.myID()
  },

  methods: {

    logIn() {
      auth.logIn()
    },

    logOut() {
      auth.logOut()
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
    :loggedIn = "loggedIn"
    :myID     = "myID"
  ></slot>
  `
}}

function GraffitiCollection(socket) { return {
  
  data: () => ({
    objectMap: {},
    queryID: null
  }),

  props: {

    // The query applied to objects in the collection
    query: {
      type: Object,
      default: () => ({})
    },

    // The way that objects are sorted
    sort: {
      type: Function,
      // by default newest -> oldest
      // so that objects[0] is the newest
      default: function(a, b) {
        return b.timestamp - a.timestamp
      },
    },

    // Are timestamps automatically added to objects
    timestamp: {
      type: Boolean,
      default: true
    }
  },

  computed: {
    // Objects sorted by the sort function
    objects() {
      return Object.values(this.objectMap).sort(this.sort)
    },
  },

  beforeUnmount() {
    if (this.queryID) {
      this.unsubscribe(this.queryID)
    }
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

        // Unsubscribe to the existing query
        if (this.queryID) {
          const oldQueryID = this.queryID
          this.queryID = null
          await socket.unsubscribe(oldQueryID)
        }

        // Clear the output
        Object.keys(this.objectMap).forEach(k => delete this.objectMap[k])

        // And subscribe to the new one
        if (this.timestamp) {
          newQuery = { "$and": [newQuery, { timestamp: { "$type": "number" } } ] }
        }
        this.queryID = await socket.subscribe(newQuery, this.objectMap)
      },
      deep: true,
      immediate: true
    },
  },

  methods: {
    async update(object) {
      // Automatically update the timestamp
      if (this.timestamp) {
        object.timestamp = Date.now()
      }

      // Send it to the server
      const id = await socket.update(object)

      // Listen if the ID actually gets added to the collection
      const updatePromise = new Promise( (resolve, reject) => {
        document.addEventListener(id, () => resolve() )
        // But if it takes too long, timeout
        setTimeout(() => reject(new Error('timeout')), 5000)
      })

      // Watch for changes to the object
      const unwatch = this.$watch(`objectMap.${id}`, () => {
        document.dispatchEvent(new Event(id))
      })

      try {
        await updatePromise
      } catch {
        await socket.delete(id)
        throw {
          type: 'error',
          content: 'the object you updated isn\'t included in this collection, so it has been deleted',
          object
        }
      } finally {
        // Stop watching
        unwatch()
      }

      return id
    },

    async delete_(id) {
      if (!(id in this.objectMap)) {
        throw {
          type: 'error',
          content: 'the object ID you\'re trying to delete is not in this collection',
          id
        }
      }
      await socket.delete(id)
    },
  },

  // Fill the inside with whatever
  template: `
  <slot
    :object        = "objects[0]"
    :objects       = "objects"
    :objectMap     = "objectMap"
    :update        = "update"
    :delete        = "delete_"
  ></slot>`
}}

class GraffitiApp extends HTMLElement {
  constructor() {
    super();

    // Get the data
    const dataStr = this.getAttribute('data');
    let data = {}
    if (dataStr) {
      data = JSON.parse(dataStr)
    }

    let graffitiURL = this.getAttribute('graffiti-url')
    if (!graffitiURL) {
      graffitiURL = 'https://graffiti.csail.mit.edu'
    }

    this.initialize(data, graffitiURL)
  }

  async initialize(data, graffitiURL) { 

    // Authorize and establish a socket
    const auth = new GraffitiAuth(graffitiURL)
    const socket = new GraffitiSocket(graffitiURL, await auth.token())

    // Create the app
    const app = Vue.createApp({
      components: {
        graffitiLogin: GraffitiLogin(auth),
        graffitiCollection: GraffitiCollection(socket)
      },
      data: () => (data)
    })

    // Create a place for it to go
    const appEl = document.createElement('div')
    const graffitiLogin = document.createElement('graffiti-login')
    graffitiLogin.setAttribute('v-slot', 'graffiti')
    graffitiLogin.innerHTML = this.innerHTML
    this.innerHTML = ""

    // Mount
    appEl.appendChild(graffitiLogin)
    this.appendChild(appEl)
    app.mount(appEl)
  }
}
customElements.define('graffiti-app', GraffitiApp)
