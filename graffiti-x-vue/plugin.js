import GraffitiAuth   from './auth.js'
import GraffitiSocket from './socket.js'
import { queryRewrite, objectRewrite }  from './rewrite.js'

function GraffitiCollection(socket) { return {
  
  data: () => ({
    objectMap: {},
    queryID: null,
    eventTarget: new EventTarget()
  }),

  props: {

    // The query applied to objects in the collection
    query: {
      type: Object,
      default: () => null
    },

    // Objects are sorted by their values
    // according to this value function
    valueFunction: {
      type: Function,
      // By default, sort by time
      default: object => object.timestamp
    },

    // Allow anonymous objects to match the query
    allowAnonymous: {
      type: Boolean,
      default: false
    },

    // Allow objects without timestamps to match the query
    allowNoTimestamp: {
      type: Boolean,
      default: false
    },

  },

  emits: ['modify'],

  computed: {
    // Objects sorted by the sort function
    objects() {
      return Object.values(this.objectMap).sort((a, b) => (
        this.valueFunction(b) - this.valueFunction(a)
      ))
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

        // Emit a modification because of the clear
        this.$emit('modify', this.objects)

        // Rewrite to account for special conditions
        newQuery = queryRewrite(
          newQuery,
          this.$graffiti.myID,
          this.allowAnonymous,
          this.allowNoTimestamp)

        // And subscribe to the new query
        this.queryID = await socket.subscribe(
          newQuery,
          this.updateCallback.bind(this),
          this.deleteCallback.bind(this))
      },
      deep: true,
      immediate: true
    },
  },

  methods: {
    async update(object, anonymous=false, timestamp=true) {

      // Perform object rewriting
      const idProof = await objectRewrite(object, this.$graffiti.myID, anonymous, timestamp)
      const id = object._id

      // Store the original object if
      // one exists, in case of failure
      let originalObject = null
      if (id in this.objectMap) {
        originalObject = this.objectMap[id]
      }

      // Immediately replace the object
      this.updateCallback(object)

      // Remove _ for the server
      const serverObject = Object.assign({}, object)
      delete serverObject._
      
      // Send it to the server
      try {
        await socket.update(serverObject, idProof)
      } catch(e) {
        if (originalObject) {
          // Restore the original object
          this.updateCallback(originalObject)
        } else {
          // Delete the temp object
          this.deleteCallback(id)
        }
        throw e
      }

      // Listen if the ID actually gets added to the collection
      const updatePromise = new Promise( (resolve, reject) => {
        this.eventTarget.addEventListener(id, () => resolve() )
        // But if it takes too long, timeout
        setTimeout(() => reject(new Error('timeout')), 5000)
      })

      try {
        await updatePromise
      } catch {
        this.deleteCallback(id)
        socket.delete(id)
        throw {
          type: 'error',
          content: 'the object you updated isn\'t included in this collection, so it has been deleted',
          object
        }
      }

      return id
    },

    async delete_(value) {
      // Allow delete to be called on IDs or on objects (with an _id)
      let id = null
      if (typeof value == 'string') {
        id = value
      } else if (typeof value == 'object') {
        if ('_id' in value) {
          id = value._id
        }
      }

      if (!id) {
        throw {
          type: 'error',
          content: 'an object ID can\'t be parsed out of the value you\'re trying to delete.',
          value
        }
      }

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
      this.deleteCallback(id)

      try {
        await socket.delete(id)
      } catch(e) {
        // Delete failed, restore the object
        this.updateCallback(obj)
        throw e
      }
    },

    async updateCallback(value) {
      // Add or copy over _
      if (value._id in this.objectMap) {
        if ('_' in this.objectMap[value._id]) {
          value._ = this.objectMap[value._id]._
        }
      }
      if (!value._) value._ = {}

      // Replace the object
      this.objectMap[value._id] = value

      // Send a local event if the update was ours
      if (this.$graffiti.byMe(value)) {
        this.eventTarget.dispatchEvent(new Event(value._id))
      }

      // Emit an event for parent components
      this.$emit('modify', this.objects)
    },

    async deleteCallback(id) {
      if (!(id in this.objectMap)) return

      delete this.objectMap[id]

      // Emit an event for parent components
      this.$emit('modify', this.objects)
    }
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
      logOut: auth.logOut.bind(auth),
      byMe: obj=>obj._by==myID,
      getAuthors: objs=>[...new Set(objs.map(o=>o._by).filter(x=>x))]
    }
  }
}
