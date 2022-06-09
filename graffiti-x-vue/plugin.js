import GraffitiAuth   from './auth.js'
import GraffitiSocket from './socket.js'

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
      socket.unsubscribe(this.queryID)
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
      // Immediately add the object to a temporary collection

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

      // Immediately delete the object
      // but store it in case there is an error
      const obj = this.objectMap[id]
      delete this.objectMap[id]

      try {
        await socket.delete(id)
      } catch(e) {
        // Delete failed, restore the object
        this.objectMap[id] = obj
        throw e
      }
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

export default async function Graffiti(graffitiURL='https://graffiti.csail.mit.edu') {
  // Authorize and establish a socket
  const auth = new GraffitiAuth(graffitiURL)
  const socket = new GraffitiSocket(graffitiURL, await auth.token())

  const myID = await auth.myID()
  const loggedIn = await auth.loggedIn()

  return function install(Vue, options) {
    Vue.component('graffiti-collection', GraffitiCollection(socket))
    Vue.config.globalProperties.$graffiti = {
      myID, loggedIn,
      logIn: auth.logIn.bind(auth),
      logOut: auth.logOut.bind(auth)
    }
  }
}
