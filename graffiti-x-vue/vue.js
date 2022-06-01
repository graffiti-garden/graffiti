import GraffitiAuth   from './auth.js'
import GraffitiSocket from './socket.js'

function GraffitiLogIn(auth) { return {
  data: () => ({
    loggedIn: false,
  }),

  created: async function() {
    // Wait for login
    this.loggedIn = await auth.loggedIn()
  },

  methods: {
    click() {
      if (this.loggedIn) {
        auth.logOut()
      } else {
        auth.logIn()
      }
    }
  },

  template: `
  <button class="graffiti-log-in-button" @click="click">
    <template v-if="loggedIn">
      log out of graffiti
    </template>
    <template v-else>
      log in to graffiti
    </template>
  </button>
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
      default: () => (null)
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
        // Don't run on null queries
        if (!newQuery) return

        // Don't update if the query hasn't actually changed
        // (it can get triggered twice because of immediate)
        const newQueryJSON = JSON.stringify(newQuery)
        const oldQueryJSON = JSON.stringify(oldQuery)
        if (newQueryJSON == oldQueryJSON) return

        // Unsubscribe to the existing query
        if (this.queryID) {
          const oldQueryID = this.queryID
          this.queryID = null
          await socket.unsubscribe(oldQueryID)
        }

        // Clear the output
        Object.keys(this.objectMap).forEach(k => delete this.objectMap[k])

        // And subscribe to the new query
        this.queryID = await socket.subscribe(newQuery, this.objectMap)
      },
      deep: true,
      immediate: true
    },
  },

  methods: {
    async update(object) {
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

export default function install(Vue, options) {
  let graffitiURL = 'https://graffiti.csail.mit.edu'
  if (options) {
    if (options.graffitiURL) {
      graffitiURL = options.graffitiURL
    }
  }

  // Authorize and establish a socket
  const auth = new GraffitiAuth(graffitiURL)
  const socket = new GraffitiSocket(graffitiURL, auth)

  Vue.component('graffiti-log-in', GraffitiLogIn(auth))
  Vue.component('graffiti-collection', GraffitiCollection(socket))
}
