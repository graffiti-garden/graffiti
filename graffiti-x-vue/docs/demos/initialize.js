import Graffiti from 'https://graffiti.csail.mit.edu/graffiti-x-vue/graffiti.js'

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
