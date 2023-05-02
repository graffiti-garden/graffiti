import Graffiti from '../../graffiti.js'

const REFRESH_RATE = 100 // milliseconds

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

      // Add static functions and constants
      for (const key of ['toggleLogIn', 'post', 'remove', 'objects', 'myContexts']) {
        Object.defineProperty(gf, key, {
          enumerable: true,
          value: graffiti[key].bind(graffiti)
        })
      }
      for (const key of ['events', 'media']) {
        Object.defineProperty(gf, key, {
          enumerable: true,
          get: ()=> graffiti[key]
        })
      }

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

      // A composable that returns a collection of objects
      Object.defineProperty(gf, 'useObjects', {
        value: context=> {
          const objectMap = Vue.reactive({})

          // Run the loop in the background
          let running = true
          let unwatchers = new Set()
          let controller
          let timeoutID = null
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
                    clearTimeout(timeoutID)
                    timeoutID = null
                  })
                  unwatchers.add(unwatch)
                }
              }

              // Watch the outer array
              watcher(context)
              // Unwrap and watch all inner arrays
              const contextUnwrapped = Vue.isRef(context)? context.value : context
              contextUnwrapped.forEach(c=> watcher(c))

              // Unwrap more and stream changes into batches
              const batch = {}
              const contextUnwrappedMore = contextUnwrapped.map(c=>Vue.isRef(c)?c.value:c)
              for await (const object of graffiti.objects(contextUnwrappedMore, signal)) {
                if (Object.keys(object).length > 1) {
                  batch[object.id] = object
                } else if (object.id in objectMap) {
                  batch[object.id] = false
                }

                // Flush the batch after timeout
                if (!timeoutID) {
                  timeoutID = setTimeout(()=> {
                    for (const [id, object] of Object.entries(batch)) {
                      if (object) {
                        objectMap[id] = object
                      } else {
                        delete objectMap[id]
                      }
                    }
                    timeoutID = null
                  }, REFRESH_RATE)
                }
              }
            }
          })()

          Vue.onScopeDispose(()=> {
            // Stop the loop
            running = false
            controller.abort()
            unwatchers.forEach(uw=> uw())
            clearTimeout(timeoutID)
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
