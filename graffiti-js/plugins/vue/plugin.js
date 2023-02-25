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
      'toggleLogIn', 'update', 'myTags', 'objectByID']) {
      const vueKey = '$graffiti' + key.charAt(0).toUpperCase() + key.slice(1)
      app.config.globalProperties[vueKey] = graffiti[key].bind(graffiti)
    }

    // A component for subscribing and
    // unsubscribing to tags that returns
    // a reactive array of the results
    app.component('GraffitiObjects', {

      props: {
        tags: {
          type: Array,
          required: true
        },
        mine: {
          type: Boolean,
          default: null
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
        tags: {
          async handler(newTags, oldTags=[]) {
            // Subscribe to the new tags
            await graffiti.subscribe(newTags)
            // Unsubscribe to the existing tags
            await graffiti.unsubscribe(oldTags)
          },
          immediate: true,
          deep: true
        }
      },

      // Handle unmounting too
      unmount() {
        graffiti.unsubscribe(this.tags)
      },

      computed: {
        objects() {
          let os = graffiti.objects(this.tags, {
            properties: this.properties,
            required: this.required
          })
          os = this.mine!=null?(this.mine?os.mine:os.notMine):os
          os = this.filter?os.filter(this.filter):os
          os = this.sortBy?os.sortBy(this.sortBy):os
          return os
        }
      },

      template: '<slot :objects="objects"></slot>'
    })

  }
}
