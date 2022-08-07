import Graffiti from 'https://csail-graffiti.github.io/graffiti-js-vue/graffiti.js'

function MyComponent({toggleLogIn, myID, useCollection}) {
  return {
    // Define your Vue component here
  }
}

Graffiti(Vue).then(g=> {
  Vue.createApp()
    .component('MyComponent', MyComponent(g))
    .mount("#app")
})
