import { createApp } from 'vue'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import ActorManager from './actor-manager.js'

async function fetchHTML(name) {
  const response = await fetch(`./html/${name}.html`)
  return await response.text()
}

const Actors = {
  data() {
    return {
      editing: '',
      nickname: ''
    }
  },

  methods: {
    rename(actor) {
      if (!this.nickname) return
      this.$root.actorManager.rename(actor, this.nickname)
      this.editing = ''
    },

    removeActor(actor) {
      const c = confirm("Are you absolutely sure you want to delete this actor? This can't be undone.")
      if (!c) return

      this.$root.actorManager.removeActor(actor)
    }
  },

  template: await fetchHTML('actors')
}

const Apps = { template: await fetchHTML('apps') }
const Welcome = { template: await fetchHTML('welcome') }
const NewApp = { template: await fetchHTML('new-app') }
NewApp.props = ['origin']

const Router = createRouter({
  history: ["localhost","127.0.0.1"].includes(window.location.hostname)?
    createWebHashHistory() : createWebHistory(),
  routes: [
    { path: '/', redirect: '/actors' },
    { path: '/actors', component: Actors },
    { path: '/apps', component: Apps },
    { path: '/new-app/:origin', component: NewApp, props: true }
  ],
})

const app = {
  components: { Welcome },

  data() {
    return {
      actors: {}, // thumbprint->actor
      _origins: {},
      nickname: ''
    }
  },

  computed: {
    origins() {
      return Object.keys(this._origins)
    }
  },

  created() {
    this.actorManager = new ActorManager()
    this.actorManager.onchange =
      ({ action, payload })=> {

        if (action.endsWith("actor")) {
          const actor = payload
          const thumbprint = actor.thumbprint
          if (action.startsWith("update")) {
            this.actors[thumbprint] = actor
          } else {
            delete this.actors[thumbprint]
          }
        } else if (action.endsWith("origin")) {
          const origin = payload
          if (action.startsWith("update")) {
            this._origins[origin] = true
          } else {
            if (origin in this._origins) {
              delete this._origins[origin]
            }
          }
        }
      }
  }
}

createApp(app)
.use(Router)
.directive('focus', { mounted: e=> e.focus() })
.mount('#app')
