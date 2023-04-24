import Graffiti from '../../graffiti.js'

export default function GraffitiPlugin(Vue, options={}) {
  return {
    install(app, options) {
      const graffiti = new Graffiti(options)

      // Begin to define a global property that mirrors
      // the vanilla spec but with some reactive props
      const glob = app.config.globalProperties
      Object.defineProperty(glob, "$graffiti", { value: Vue.shallowReactive({}) } )
      Object.defineProperty(glob, "$gf", { value: glob.$graffiti } )
      const gf = glob.$gf

      // Add static functions
      for (const key of ['toggleLogIn', 'post', 'remove', 'objects', 'myContexts']) {
        Object.defineProperty(gf, key, {
          enumerable: true,
          value: graffiti[key].bind(graffiti)
        })
      }
      Object.defineProperty(gf, 'events', {
        enumerable: true,
        get: ()=> graffiti.events
      })

      // These variables are reactive because
      // $gf is shallow reactive
      gf.me = ''
      gf.connected = false
      gf.events.addEventListener('connected',
        ()=> {
          gf.me = graffiti.me
          gf.connected = true
        }
      )
      gf.events.addEventListener('disconnected',
        ()=> gf.connected = false
      )

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
          let unwatchers = new Set()
          let controller
          ;(async ()=> {
            while (running) {
              controller = new AbortController();
              const signal = controller.signal;

              const watcher = watchVar=> {
                if (Vue.isRef(watchVar) || Vue.isReactive(watchVar)) {
                  const unwatch = Vue.watch(watchVar, ()=> {
                    // Clear the object map and restart the loop
                    Object.keys(objectMap).forEach(k=> delete objectMap[k])
                    controller.abort()
                    unwatch()
                    unwatchers.delete(unwatch)
                  })
                  unwatchers.add(unwatch)
                }
              }

              // Watch the outer array
              watcher(context)

              // Unwrap and watch all inner arrays
              const contextUnwrapped = Vue.isRef(context)? context.value : context
              contextUnwrapped.forEach(c=> watcher(c))

              // Unwrap more and loop
              const contextUnwrappedMore = contextUnwrapped.map(c=>Vue.isRef(c)?c.value:c)
              for await (const object of graffiti.objects(contextUnwrappedMore, signal)) {
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
            unwatchers.forEach(uw=> uw())
            unwatchers.clear()
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
