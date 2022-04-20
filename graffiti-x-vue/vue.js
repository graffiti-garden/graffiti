import GraffitiTools from './vanilla.js'

export default function GraffitiComponents(vue, graffitiURL='https://graffiti.csail.mit.edu') {

  const graffiti = new GraffitiTools(graffitiURL)

  const GraffitiLogin = {
    data: () => ({
      loggedIn: false,
      mySignature: ""
    }),

    beforeMount() {
      // If we logged in via cache, update
      if (graffiti.loggedIn) {
        this.loggedIn = graffiti.loggedIn
        this.mySignature = graffiti.mySignature
      }
    },

    methods: {

      async logIn() {
        this.loggedIn = await graffiti.logIn()
        this.mySignature = graffiti.mySignature
      },

      logOut() {
        graffiti.logOut()
        this.loggedIn = false
      },

    },

    template: `
    <div>
      <template v-if="loggedIn">
        <a href="" @click.prevent="logOut">log out</a>
      </template>
      <template v-else>
        <a href="" @click.prevent="logIn">log in</a>
      </template>
    </div>

    <template v-if="loggedIn">
      <slot
        :logOut        = "logOut"
        :logIn         = "logIn"
        :loggedIn      = "loggedIn"
        :mySignature   = "mySignature"
      ></slot>
    </template>
    `
  }

  const GraffitiCollection = {

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
    }),

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
      try {
        data = JSON.parse(dataStr)
      } catch(e) {
        console.error('data is not valid JSON:', e.message);
      }
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
