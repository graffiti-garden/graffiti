import Graffiti from '@graffiti-garden/graffiti-p2p'

import GraffitiLinks from './GraffitiLinks.vue'
import { shallowReactive, reactive, isRef, watch, onScopeDispose, computed } from 'vue'

const REFRESH_RATE = 100 // milliseconds

export default {
  install(app, options) {
    const graffiti = new Graffiti(options)
    const graffitiPlugin = shallowReactive({})

    // Add static functions and constants
    for (const key of [
      'logIn',
      'logOut',
      'postLink',
      'deleteLink',
      'addMeListener',
      'removeMeListener',
      'addLinkListener',
      'removeLinkListener',
      'createPostLinkCapability',
      'createDeleteLinkCapability',
      'useLinkCapability'
    ]) {
      Object.defineProperty(graffitiPlugin, key, {
        enumerable: true,
        value: graffiti[key].bind(graffiti)
      })
    }

    // Make me reactive
    graffiti.addMeListener(me=> {
      graffitiPlugin.me = me
    })

    // A composable that returns a collection of objects
    Object.defineProperty(graffitiPlugin, 'useLinks', { value: source=> {
      const linkMap =  reactive({})

      const batch = {}
      let timeoutID = null
      function listener(link) {
        // Add to the batch
        batch[link.id] = link

        if (!timeoutID) {
          timeoutID = setTimeout(()=> {
            const links = Object.values(batch)
            for (const link of links) {
              if (link.deleted && link.id in linkMap) {
                delete linkMap[link.id]
              } else if (!link.deleted) {
                linkMap[link.id] = link
              }
              // Remove from the batch
              delete batch[link.id]
            }
            timeoutID = null
          }, REFRESH_RATE)
        }
      }

      graffiti.addLinkListener(
        isRef(source)? source.value : source,
        listener
      )

      const unwatch =
        isRef(source)?
          watch(source, (newSource, oldSource)=> {
            // Clear the object map and restart the loop
            graffiti.removeLinkListener(oldSource, listener)
            Object.keys(linkMap).forEach(k=> delete linkMap[k])
            clearTimeout(timeoutID)
            timeoutID = null
            graffiti.addLinkListener(newSource, listener)
          }) : ()=> {}

      onScopeDispose(()=> {
        // Stop the loop
        unwatch()
        clearTimeout(timeoutID)
        graffiti.removeLinkListener(
          isRef(source)? source.value : source,
          listener
        )
      })

      // Strip IDs
      return { links: computed(()=> Object.values(linkMap)) }
    }})

    // Begin to define a global property that mirrors
    // the vanilla spec but with some reactive props
    const glob = app.config.globalProperties
    Object.defineProperty(glob, "$graffiti", { value: graffitiPlugin })
    Object.defineProperty(glob, "$gf",       { value: graffitiPlugin })

    // Provide it globally to setup
    app.provide('graffiti', graffitiPlugin)

    // Add the component
    app.component('GraffitiLinks', GraffitiLinks)
  }
}