import { createApp, reactive } from 'vue'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import ActorManager from './actor-manager.js'
import './style.css'
import App from './App.vue'
import Actors from './components/Actors.vue'
import Apps from './components/Apps.vue'
import NewApp from './components/NewApp.vue'

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
        const {origin, thumbprint} = payload
        origins[origin] = thumbprint
      } else {
        if (payload in origins) {
          delete origins[payload]
        }
      }
    }
  }

const Router = createRouter({
  history: ["localhost","127.0.0.1"].includes(window.location.hostname)?
    createWebHashHistory() : createWebHistory(),
  routes: [
    { path: '/', component: Actors },
    { path: '/apps', component: Apps },
    { path: '/new-app/:origin', component: NewApp, props: true }
  ],
})

const app = createApp(App)
.use(Router)
.directive('focus', { mounted: e=> e.focus() })
.provide('origins', origins)
.provide('actors', actors)
.provide('actorManager', actorManager)
.mount('#app')