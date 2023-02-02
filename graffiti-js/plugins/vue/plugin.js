import { ref, reactive } from 'vue'
import Graffiti from '../../graffiti.js'

export default {
  install(app, options) {

    const graffitiURL = options && 'url' in options?
      options.url : 'https://graffiti.garden'

    // Initialize graffiti with reactive entries
    const graffiti = new Graffiti(graffitiURL, ()=>reactive({}))

    // These ID need to change after opening
    const myID = ref(null)
    graffiti.opened().then(()=> {
      myID.value = graffiti.myID
    })
    Object.defineProperty(app.config.globalProperties, "$graffitiMyID", {
      get: ()=> myID.value
    })

    // Add static functions
    for (const key of ['toggleLogIn', 'update', 'myTags', 'objectByKey']) {
      const vueKey = '$graffiti' + key.charAt(0).toUpperCase() + key.slice(1)
      app.config.globalProperties[vueKey] = graffiti[key].bind(graffiti)
    }

    // A component for subscribing and
    // unsubscribing to tags that returns
    // a reactive array of the results
    app.component('GraffitiObjects', {

      props: ['tags'],

      watch: {
        tags: {
          async handler(newTags, oldTags=[]) {
            // Subscribe to the new tags
            await graffiti.subscribe(...newTags)
            // Unsubscribe to the existing tags
            await graffiti.unsubscribe(...oldTags)
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
          return graffiti.objectsByTags(...this.tags)
        }
      },

      template: '<slot :objects="objects"></slot>'
    })

  }
}
