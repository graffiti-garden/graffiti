export default function(socket) { return {
  
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

    // Objects with the same value are
    // considered equal
    // Takes in a function that gives
    // a value to an object to see if those objects are
    // equal
    //group: {
      //type: Function,
      //default: (obj) => False
    //}

    // Merge a function that takes an
    // Each group
    // For example, last writer wins or a more complicated
    //
    //merge: {
    //}

    // Objects are sorted by this compare function
    sort: {
      type: Function,
      // By default, everything is equal
      // so sorting is arbitrary
      default: (a, b) => 0
    },


  },

  emits: ['modify'],

  computed: {
    // Objects sorted by the sort function
    objects() {
      return Object.values(this.objectMap).sort(this.sort)
    },

    // Objects owned by me
    myObjects() {
      return this.objects.filter(o=> o._by==socket.myID)
    }
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
    async update(object) {
      if (!socket.loggedIn) {
        throw {
          type: 'error',
          content: 'you can\'t update objects without logging in!'
        }
      }

      // Give the object an _id, etc.
      socket.completeObject(object)

      // Immediately replace the object
      const originalObject = this.updateCallback(object)

      // Remove _ and for the server
      const serverObject = Object.assign({}, object)
      delete serverObject._

      // Send it to the server
      try {
        await socket.update(serverObject)
      } catch(e) {
        if (originalObject) {
          // Restore the original object
          this.updateCallback(originalObject)
        } else {
          // Delete the temp object
          this.deleteCallback(object)
        }
        throw e
      }

      // Listen if the ID actually gets added to the collection
      const updatePromise = new Promise( (resolve, reject) => {
        this.eventTarget.addEventListener(socket.objectUUID(object), () => resolve() )
        // But if it takes too long, timeout
        setTimeout(() => reject(new Error('timeout')), 5000)
      })

      try {
        await updatePromise
      } catch {
        this.deleteCallback(object)
        socket.delete(object._id)
        throw {
          type: 'error',
          content: 'the object you updated isn\'t included in this collection, so it has been deleted',
          object
        }
      }

      return object
    },

    async delete_(object) {
      if (!socket.loggedIn) {
        throw {
          type: 'error',
          content: 'you can\'t delete objects without logging in!'
        }
      }

      const uuid = socket.objectUUID(object)
      if (!(uuid in this.objectMap)) {
        throw {
          type: 'error',
          content: 'the object ID you\'re trying to delete is not in this collection',
          id
        }
      }

      // Immediately delete the object
      // but store it in case there is an error
      const originalObject = this.objectMap[uuid]
      this.deleteCallback(object)

      try {
        await socket.delete(object._id)
      } catch(e) {
        // Delete failed, restore the object
        this.updateCallback(originalObject)
        throw e
      }
    },

    async deleteMine() {
      for (const object of this.myObjects) {
        this.delete_(object)
      }
    },

    async updateCallback(object) {
      const uuid = socket.objectUUID(object)

      // Store the original object if
      // one exists, in case of failure
      let originalObject = null
      if (uuid in this.objectMap) {
        originalObject = this.objectMap[uuid]

        // Copy over the "workspace" for the
        // object (which also won't go to the server)
        if ('_' in originalObject) {
          object._ = originalObject._
        }
      }

      // Generate the workspace if it doesn't exist
      if (!object._) object._ = {}

      // Replace the object
      this.objectMap[uuid] = object

      // Send a local event if the update was ours
      if (object._by == socket.myID) {
        this.eventTarget.dispatchEvent(new Event(uuid))
      }

      // Emit an event for parent components
      this.$emit('modify', this.objects)

      // Return the original in case of failure
      return originalObject
    },

    async deleteCallback(object) {
      const uuid = socket.objectUUID(object)
      if (!(uuid in this.objectMap)) return

      delete this.objectMap[uuid]

      // Emit an event for parent components
      this.$emit('modify', this.objects)
    }
  },

  // Fill the inside with whatever
  template: `
  <slot
    :object        = "objects[0]"
    :objects       = "objects"
    :myObjects     = "myObjects"
    :objectMap     = "objectMap"
    :update        = "update"
    :delete        = "delete_"
    :deleteMine    = "deleteMine"
  ></slot>`
}}
