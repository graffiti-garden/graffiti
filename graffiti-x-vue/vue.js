import GraffitiTools from './vanilla.js'

export default function GraffitiCollection(vue, graffitiURL='https://graffiti.csail.mit.edu') {
  const graffiti = new GraffitiTools(graffitiURL)

  return {

    props: {

      // The base form that all objects should fit
      base: {
        type: Object,
        default: () => ({})
      },

      // The additional filter that all
      // objects should adhere to
      filter: {
        type: Object,
        default: () => ({})
      },

      // How many objects should be
      // pre-loaded from the start
      queue: {
        type: Number,
        default: 0,
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
      mySignature: ""
    }),

    beforeMount() {
      // Use our signature
      graffiti.isInitialized().then(() => {
        this.mySignature = graffiti.mySignature
      })
    },

    computed: {
      // Objects sorted by the sort function
      objects() {
        return Object.values(this.objectMap).sort(this.sort)
      },

      // The actual query sent to the server
      query() {
        // Start with the base, but let the
        // object overwrite, if desired.
        const basedFilter = Object.assign({}, this.base)
        Object.assign(basedFilter, this.filter)
        return {
          "$and": [
            basedFilter,
            { timestamp: { "$type": "long" } }
          ]
        }
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
          if (JSON.stringify(newQuery) == JSON.stringify(oldQuery)) return

          // Update the query and rewind
          await this.querySubscriber.update(newQuery)
          await this.rewind(this.queue)
        },
        deep: true,
        immediate: true
      },
    },

    methods: {
      async rewind(limit) {
        this.canRewind = await this.querySubscriber.rewind(limit)
        return this.canRewind
      },

      async play(limit) {
        return await this.querySubscriber.play(limit)
      },

      async update(object) {
        // Start with the base, but let the object
        // overwrite it if desired.
        const basedObject = Object.assign({}, this.base)
        Object.assign(basedObject, object)

        // Send it to the server
        const id = await graffiti.update(basedObject)

        // Then make sure it is returned in the query
        const output = await graffiti.queryOne({ "$and": [
          this.query,
          { id: id }
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
      :objects       = "objects"
      :canRewind     = "canRewind"
      :mySignature   = "mySignature"
      :update        = "update"
      :delete        = "delete_"
      :play          = "play"
      :rewind        = "rewind"
    ></slot>`
  }
}
