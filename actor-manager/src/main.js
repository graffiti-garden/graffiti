import { createApp, reactive } from 'vue'
import './style.css'
import App from './App.vue'
import ActorManager from './actor-manager.js'

const actors = reactive({})
const origins = reactive({})

const actorManager = new ActorManager()
actorManager.onchange =
  ({ action, payload })=> {

    if (action.endsWith("actor")) {
      const actor = payload
      const thumbprint = actor.thumbprint

      if (action.startsWith("update")) {
        actors[thumbprint] = actor
      } else {
        delete actors[thumbprint]
      }

    } else if (action.endsWith("origin")) {

      if (action.startsWith("update")) {
        const [origin, thumbprint] = Object.entries(payload)[0]
        origins[origin] = thumbprint
      } else {
        if (payload in origins) {
          delete origins[payload]
        }
      }
    }
  }

const app = createApp(App)
.provide('origins', origins)
.provide('actors', actors)
.provide('actorManager', actorManager)
.directive('focus', { mounted: e=> e.focus() })
.mount('#app')