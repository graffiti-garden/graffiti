import Socket     from './graffiti-js-vanilla/src/socket.js'
import Collection from './src/collection.js'

export default async function Graffiti(graffitiURL='https://graffiti.csail.mit.edu') {
  // Authorize and establish a socket
  const socket = new Socket(graffitiURL)
  await socket.initialize()

  return function install(Vue, options) {
    Vue.component('graffiti-collection', Collection(socket))
    Vue.config.globalProperties.$graffiti = {
      myID: socket.myID,
      loggedIn: socket.loggedIn,
      logIn: socket.logIn.bind(socket),
      logOut: socket.logOut.bind(socket),
      byMe: obj=>obj._by==socket.myID,
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
