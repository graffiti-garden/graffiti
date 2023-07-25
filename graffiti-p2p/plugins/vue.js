import Graffiti from '../graffiti-p2p.js'

export default function GraffitiPlugin(Vue) {
  return {
    install(app, options) {
      const graffiti = new Graffiti({
        objectConstructor: ()=> {
          console.log("constructing...")
          return Vue.reactive({})
        },
        ...options
      })

      // A composable that returns a collection of objects
      graffiti.usePosts = contextPath=> {
        const context = graffiti.context(contextPath)

        Vue.onScopeDispose(()=> {
          // TODO: end the context?
        })

        return {
          posts: Vue.computed(()=> context.posts())
        }
      }

      // Begin to define a global property that mirrors
      // the vanilla spec but with some reactive props
      const glob = app.config.globalProperties
      Object.defineProperty(glob, "$graffiti", { value: graffiti })
      Object.defineProperty(glob, "$gf",       { value: graffiti })

      // Provide it globally to setup
      app.provide('graffiti', graffiti)
    }
  }
}