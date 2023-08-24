import { default as Graffiti, PostArray } from '@graffiti-garden/graffiti-p2p'

import GraffitiPosts from './GraffitiPosts.vue'
import { reactive, isRef, watch, onScopeDispose, computed } from 'vue'

const REFRESH_RATE = 100 // milliseconds

export default {
  install(app, options) {
    const graffiti = new Graffiti({
      ...options,
      objectContainer: ()=> reactive({})
    })

    // A composable that returns a collection of objects
    graffiti.usePosts = contextPath=> {
      const postMap = reactive({})

      // Run the loop in the background
      let running = true
      let controller
      let timeoutID = null
      let unwatch = ()=>{}
      ;(async ()=> {

        while (running) {
          controller = new AbortController();
          const signal = controller.signal;

          unwatch =
            isRef(contextPath)?
              watch(contextPath, ()=> {
                // Clear the object map and restart the loop
                Object.keys(postMap).forEach(k=> delete postMap[k])
                controller.abort()
                unwatch()
                clearTimeout(timeoutID)
                timeoutID = null
              }) : ()=>{}

          // Unwrap more and stream changes into batches
          const batch = {}
          const postIterator = graffiti.posts(
            isRef(contextPath)?
            contextPath.value :
            contextPath,
            signal)
          try {
            for await (const postUpdate of postIterator) {
              batch[postUpdate.hashURI] = postUpdate

              // Flush the batch after timeout
              if (!timeoutID) {
                timeoutID = setTimeout(()=> {
                  for (const update of Object.values(batch)) {
                    if (update.action == "add") {
                      postMap[update.hashURI] = update.value
                    } else {
                      if (update.hashURI in postMap)
                        delete postMap[update.hashURI]
                    }
                  }
                  timeoutID = null
                }, REFRESH_RATE)
              }
            }
          } catch (e) {
            if (e.code != DOMException.ABORT_ERR) {
              throw e
            }
          }
        }
      })()

      onScopeDispose(()=> {
        // Stop the loop
        running = false
        controller.abort()
        unwatch()
        clearTimeout(timeoutID)
      })

      // Strip IDs
      return { posts: computed(()=> new PostArray(
        graffiti,
        isRef(contextPath)? contextPath.value : contextPath,
        null,
        ...Object.values(postMap)
      ))}
    }

    // Begin to define a global property that mirrors
    // the vanilla spec but with some reactive props
    const glob = app.config.globalProperties
    Object.defineProperty(glob, "$graffiti", { value: graffiti })
    Object.defineProperty(glob, "$gf",       { value: graffiti })

    // Provide it globally to setup
    app.provide('graffiti', graffiti)

    // Add the component
    app.component('GraffitiPosts', GraffitiPosts)
  }
}