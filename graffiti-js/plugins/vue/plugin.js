import { ref, reactive } from 'vue'
import Graffiti from '../../graffiti.js'

export default {
  install(app, options) {

    // Initialize graffiti with reactive entries
    const graffiti = new Graffiti({
      objectConstructor: ()=>reactive({}),
      ...options
    })

    // Create a reactive variable that
    // tracks connection state
    const connectionState = ref(false)
    ;(function waitForState(state) {
      graffiti.connectionState(state).then(()=> {
        connectionState.value = state
        waitForState(!state)
    })})(true)
    Object.defineProperty(app.config.globalProperties, "$graffitiConnected", {
      get: ()=> connectionState.value
    })

    // Latch on to the graffiti ID
    // when the connection state first becomes true
    let myActor = null
    Object.defineProperty(app.config.globalProperties, "$graffitiMyActor", {
      get: ()=> {
        if (connectionState.value) myActor = graffiti.myActor
        return myActor
      }
    })

    // Add static functions
    for (const key of [
      'toggleLogIn', 'update', 'myContexts']) {
      const vueKey = '$graffiti' + key.charAt(0).toUpperCase() + key.slice(1)
      app.config.globalProperties[vueKey] = graffiti[key].bind(graffiti)
    }

    // A component for subscribing and
    // unsubscribing to contexts that returns
    // a reactive array of the results
    app.component('GraffitiObjects', {

      props: {
        context: {
          type: Array,
          required: true
        },
        mine: {
          type: Boolean,
          default: null
        },
        schema: {
          type: Object,
          default: {}
        },
        properties: {
          type: Object,
          default: {}
        },
        required: {
          type: Array,
          default: []
        },
        filter: {
          type: Function
        },
        sortBy: {
          type: String
        }
      },

      watch: {
        context: {
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
        graffiti.unsubscribe(this.context)
      },

      computed: {
        objects() {
          const schema = Object.assign({}, this.schema)
          if (!('properties' in schema)) schema.properties = this.properties
          if (!('required'   in schema)) schema.required   = this.required
          let os = graffiti.objects(this.context, schema)
          os = this.mine!=null?(this.mine?os.mine:os.notMine):os
          os = this.filter?os.filter(this.filter):os
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
          :properties="{id: { enum: [id]}}">
          <slot :object="objects.length?objects[0]:{}"></slot>
        </GraffitiObjects>`
    })
  }
}
