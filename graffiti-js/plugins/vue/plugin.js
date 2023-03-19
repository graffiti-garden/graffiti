import { ref, reactive } from 'vue'
import Graffiti from '../../graffiti.js'

export default {
  install(app, options) {

    // Initialize graffiti with reactive entries
    const graffiti = new Graffiti({
      objectConstructor: ()=>reactive({}),
      ...options
    })

    const glob = app.config.globalProperties

    // Begin to define a global property
    Object.defineProperty(glob,  "$graffiti", { value: {} } )
    Object.defineProperty(glob,  "$gf", { value: glob.$graffiti } )
    const gf = glob.$gf

    // Create a reactive variable that
    // tracks connection state
    const connectionState = ref(false)
    ;(function waitForState(state) {
      graffiti.connectionState(state).then(()=> {
        connectionState.value = state
        waitForState(!state)
    })})(true)
    Object.defineProperty(gf, "connected", {
      get: ()=> connectionState.value,
      enumerable: true
    })

    // Latch on to the graffiti ID
    // when the connection state first becomes true
    let me = null
    Object.defineProperty(gf, "me", {
      get: ()=> {
        if (connectionState.value) me = graffiti.me
        return me
      },
      enumerable: true
    })

    // Add static functions
    for (const key of [
      'toggleLogIn', 'update', 'myContexts']) {
      Object.defineProperty(gf, key, {
        value: graffiti[key].bind(graffiti),
        enumerable: true
      })
    }

    // A component for subscribing and
    // unsubscribing to contexts that returns
    // a reactive array of the results
    app.component('GraffitiObjects', {

      props: {
        context: {
          type: Array,
          default: null
        },
        mine: {
          type: Boolean,
          default: null
        },
        schema: {
          type: Object,
          default: {}
        },
        filter: {
          type: Function
        },
        sort: {
          type: Function
        },
        sortBy: {
          type: String
        },
        filterPrivate: {
          type: Boolean,
          default: true
        },
        filterAttribution: {
          type: Boolean,
          default: true
        }
      },

      watch: {
        contextWithDefault: {
          async handler(newContexts, oldContexts=[]) {
            // Subscribe to the new contexts
            await graffiti.subscribe(newContexts)
            // Unsubscribe to the existing contexts 
            await graffiti.unsubscribe(oldContexts)
          },
          immediate: true,
          deep: true
        }
      },

      // Handle unmounting too
      unmount() {
        graffiti.unsubscribe(this.contextWithDefault)
      },

      computed: {
        contextWithDefault() {
          return !this.context?[this.$gf.me]:this.context
        },

        objects() {
          const schema = Object.assign({}, this.schema)
          let os = graffiti.objects(
            this.contextWithDefault,
            schema,
            this.filterPrivate,
            this.filterAttribution)
          os = this.mine!=null?(this.mine?os.mine:os.notMine):os
          os = this.filter?os.filter(this.filter):os
          os = this.sort?os.sort(this.sort):os
          os = this.sortBy?os.sortBy(this.sortBy):os
          return os
        }
      },

      template: '<slot :objects="objects"></slot>'
    })

    // A single graffiti object by it's ID
    app.component('GraffitiObject', {
      props: {
        id: {
          type: String,
          required: true
        }
      },

      template: `
        <GraffitiObjects v-slot={objects}
          :context=[id]
          :filter="o=> o.id==id"
          :filterPrivate=false
          :filterAttribution=false>
          <slot :object="objects.length?objects[0]:null"></slot>
        </GraffitiObjects>`
    })
  }
}
