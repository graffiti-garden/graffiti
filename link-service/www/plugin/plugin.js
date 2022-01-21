import { createApp } from 'https://cdnjs.cloudflare.com/ajax/libs/vue/3.2.23/vue.esm-browser.min.js'
import Theater from '/js/theater.js'

const app = createApp({
  data() {
    return {
      myList: []
    }
  },

  methods: {
    addElement() {
      const address = Math.random().toString().substr(2, 8);
      const value = {hi: "test"}
      const myPut = this.put(address, value)
      console.log(myPut.foo)
      this.myList.unshift(myPut)
    }
  }
})
app.use(Theater, window.location.origin) 
app.mount("#app");


  //data: {
    //th: new Theater(window.location.origin),
    //cache: {}
  //},

  //methods: {

    //// Proxy
    //Proxy(data, handler) {
    //}

    //// These ones are actually easy
    //put: async function(data, mutable=True, timestamped=True, signed=True) {
    //}
    //perform: async function(data, mutable=False) {
    //}

    //// These ones require registering a function to a thing...
    //get: async function(address) {

      //const value = fetch(address)

      //// This value is static and will never change
      //Vue.set(this.cache, address, value)

      //// If it's a placeholder start attending
      //// and add a specified callback.
      //// The placeholder settings should be set by the user (custom filter)

      //// Return an object with a handler
      //// so that whenever I say "get" and it encounters an address,
      //// it automatically fetches the result using get.
      //// if the object is a placeholder and get is called 
      ////
      //// (but how long should it wait on placeholders?
      //// Should that not matter if everything is a proxy object
      //// passed by reference?)
      ////
      //// And if I say "set" it sets if the object is a placeholder, otherwise it throws an error.
      //return new Proxy(this.cache.address)
    //}

    //attend: async function(stage, callback) {
      //// Do a similar thing to above.
      //// When I receive something store it in the cache
      //// and return the proxy object to the callback.
    //}

    //// Object
    //// Create a mutable object (default)
    //// Create a timestamped object (default)
    //// Create a signed object (default)
    ////
    //// Object has 
    //// await get(".object.name")
    //// await set(".object.name", "Theia")
    ////
    //// I can also attach the object to things
    //// using dynamic setters
   
    //// Get a specific object ()
  //},
//})

//const myObj = get('0x1234')
//// my object should change if 

//// Write a Vuejs plugin to do the following:
////
//// Objects are reactive components. I.e. if an object is a placeholder and it's contents change, it and it's dependencies will change as well.
//// There is also an object cache so that 
//// Create a cache
//// ID -> thing
//// Have lazy expansion with getter/setter object
////
//// await myPodNote.object
//// Will fetch things from the cache or get them from the network
//// If it is a placeholder it will attend and dynamically update
