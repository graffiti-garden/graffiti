import GraffitiAuth       from './src/auth.js'
import GraffitiSocket     from './src/socket.js'
import GraffitiCollection from './src/collection.js'

export default async function Graffiti(graffitiURL='https://graffiti.csail.mit.edu') {
  // Authorize and establish a socket
  const auth = new GraffitiAuth(graffitiURL)
  const socket = new GraffitiSocket(graffitiURL, await auth.token())

  const myID = await auth.myID()
  const loggedIn = await auth.loggedIn()

  return function install(Vue, options) {
    Vue.component('graffiti-collection', GraffitiCollection(socket))
    Vue.config.globalProperties.$graffiti = {
      myID, loggedIn,
      logIn: auth.logIn.bind(auth),
      logOut: auth.logOut.bind(auth),
      byMe: obj=>obj._by==myID,
      getAuthors: objs=>[...new Set(objs.map(o=>o._by).filter(x=>x))]
    }
  }
}

// A custom component to automount the plugin
// (mostly useful for live coding)
export function registerGraffitiApp(graffiti, createApp) {
  customElements.define('graffiti-app',
    class extends HTMLElement {
      connectedCallback() {
        createApp().use(graffiti).mount(this)
      }
    }
  )
}
