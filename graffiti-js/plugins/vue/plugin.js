import Graffiti from '../../graffiti.js'

export default function GraffitiPlugin(Vue, options={}) {
  return {
    install(app, options) {
      const graffiti = new Graffiti(options)

      // Begin to define a global property that mirrors
      // the vanilla spec but with some reactive props
      const glob = app.config.globalProperties
      Object.defineProperty(glob, "$graffiti", { value: {} } )
      Object.defineProperty(glob, "$gf", { value: glob.$graffiti } )
      const gf = glob.$gf

      // Add static functions
      for (const key of ['toggleLogIn', 'post', 'remove', 'objects', 'myContexts']) {
        Object.defineProperty(gf, key, {
          enumerable: true,
          value: graffiti[key].bind(graffiti)
        })
      }

      // Create a reactive variable that
      // tracks connection state
      Object.defineProperty(gf, 'events', {
        enumerable: true,
        get: ()=> graffiti.events
      })
      const connectionState = Vue.ref(false)
      gf.events.addEventListener('connected',
        ()=> connectionState.value = true
      )
      gf.events.addEventListener('disconnected',
        ()=> connectionState.value = false
      )
      Object.defineProperty(gf, "connected", {
        enumerable: true,
        get: ()=> connectionState.value
      })

      // Make "me" reactive by latching
      // when the connection state first becomes true
      let me = null
      Object.defineProperty(gf, "me", {
        enumerable: true,
        get: ()=> {
          if (connectionState.value) me = graffiti.me
          return me
        }
      })

      const torrentToBlobURL = Vue.reactive({})
      Object.defineProperty(gf, 'media', {
        value: {
          store: graffiti.media.store.bind(graffiti.media),
          fetchBlob:  graffiti.media.fetchBlob.bind(graffiti.media),
          // Make this synchronous but return a reactive variable
          fetchBlobURL(torrentReference) {
            if (!(torrentReference in torrentToBlobURL)) {
              torrentToBlobURL[torrentReference] = null

              graffiti.media.fetchBlobURL(torrentReference).then(
                u=> torrentToBlobURL[torrentReference] = u)
            }
            return torrentToBlobURL[torrentReference]
          }
        },
        enumerable: true
      })

      // A composable that returns a collection of objects
      Object.defineProperty(gf, 'useObjects', {
        value: context=> {
          const objectMap = Vue.reactive({})

          // Run the loop in the background
          let running = true
          let unwatch = ()=>null
          let controller
          ;(async ()=> {
            while (running) {
              controller = new AbortController();
              const signal = controller.signal;

              if (Vue.isRef(context) || Vue.isReactive(context)) {
                unwatch = Vue.watch(context, ()=> {
                  // Clear the object map and restart the loop
                  Object.keys(objectMap).forEach(k=> delete objectMap[k])
                  controller.abort()
                  unwatch()
                })
              }
              
              const contextUnwrapped =
                (Vue.isRef(context)?context.value:context)
                .map(c=>Vue.isRef(c)?c.value:c)
              for await (const object of graffiti.objects(contextUnwrapped, signal)) {
                if (Object.keys(object).length > 1) {
                  objectMap[object.id] = object
                } else if (object.id in objectMap) {
                  delete objectMap[object.id]
                }
              }
            }
          })()

          Vue.onScopeDispose(()=> {
            // Stop the loop
            running = false
            controller.abort()
            unwatch()
          })

          // Strip IDs
          const objects = Vue.computed(()=> Object.values(objectMap))
          return { objects }
        }
      })

      // Provide it globally to setup
      app.provide('graffiti', gf)
    }
  }
}
