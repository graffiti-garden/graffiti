import Graffiti from '@graffiti-garden/graffiti-p2p'

import GraffitiLinks from './GraffitiLinks.vue'
import { shallowReactive, reactive, unref, isRef, watch, onScopeDispose, computed, watchEffect } from 'vue'
import { isReactive } from '@vue/reactivity'

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
    Object.defineProperty(graffitiPlugin, 'useLinks', { value: (sourceOrSources)=> {
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

      let sources
      if (typeof sourceOrSources == 'string' || (
        isRef(sourceOrSources) && typeof sourceOrSources.value == 'string')){
        sources = [sourceOrSources]
      } else {
        sources = sourceOrSources
      }

      unref(sources).forEach(source=> {
        graffiti.addLinkListener(unref(source), listener)
      })

      const unwatchers = []
      if (isReactive(sources) || isRef(sources)) {
        const unwatch = 
          watch(sources, (newSources, oldSources)=> {
            if (!isReactive(newSources) &&
              newSources.length == oldSources.length &&
              newSources.every((v,i)=>unref(v)==unref(oldSources[i]))
              ) {
              return
            }
            
            oldSources.forEach(source=>
              graffiti.removeLinkListener(unref(source), listener)
            )
            Object.keys(linkMap).forEach(k=> delete linkMap[k])
            clearTimeout(timeoutID)
            timeoutID = null
            newSources.forEach(source=>
              graffiti.addLinkListener(unref(source), listener)
            )
          }, {deep: true})
        unwatchers.push(unwatch)
      }

      for (const source of unref(sources)) {
        const unwatch =
          isRef(source)?
            watch(source, (newSource, oldSource)=> {
              // Clear the object map and restart the loop
              graffiti.removeLinkListener(oldSource, listener)
              Object.keys(linkMap).forEach(k=> delete linkMap[k])
              clearTimeout(timeoutID)
              timeoutID = null
              graffiti.addLinkListener(newSource, listener)
            }, {deep: true}) : ()=> {}
        unwatchers.push(unwatch)
      }

      onScopeDispose(()=> {
        // Stop the loop
        unwatchers.forEach(unwatch=> unwatch())
        clearTimeout(timeoutID)
        unref(sources).forEach(source=> {
          graffiti.removeLinkListener(unref(source), listener)
        })
      })

      // Strip IDs without creating a ref
      const links = reactive([])
      watchEffect(()=> {
        const mapValues = Object.values(linkMap)
        Object.assign(links, mapValues)
        links.length = mapValues.length
      })
      return { links }
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