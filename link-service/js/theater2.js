// Test I should change my actor and see everything change

const staticProxy = {
  get(obj, property, receiver) {
    // If the property points to an address
    if (obj[property] is an address) {
      // Get it from the cache or network
      return this.get(property)
    }
    return Reflect.get(...arguments);
  }

  set(obj) {
    // Create and send a patch message

    // create and send a message
  }
}

update(message) {
}

const placeholderProxy = {
  get(obj, property, receiver) {
    // Iterate over the messages and choose the best one
    // Or no... these should be done incrementally
  }
}

export default {
  install(vue, origin) {
    vue.mixin({

      created() {
        // TODO: authenticate
      },

      methods: {

        async perform(value) {
        }

        async 

        async put(value, signed) {
          // Put the value on the server
          const id = await this.auth.request('post', 'put', {
            data: JSON.stringify(value)
          })

          // Store it in the cache
          this.cache.id = value

          // Return a reference to it
          return getByID(id)
        }

        async getByID(id) {
          // Check to see if it's already in the cache
          if ( !(id in this.cache) ) {
            // Fetch the value
            const value = await this.auth.request('get', 'get', {path: path})

            // Store it in the cache
            this.cache.id = value
          }

          // Start listening
          this.attendByID(id, thisCallbackIsAUserInput)

          // 
          return new Proxy(this.cache.id, podHandler)
        }

      }
    });
  }
}

const actor = this.getMy("actor")

actor.name = "Theia" // -> this automatically updates by sending a patch

// What if everything is a placeholder??

const myNote = {
  type: "Note",
  content: "my thingy ma bob"
}

this.perform({
  type: "Create",
  object: {
    signed: 
  },
  actor: actor
}

this.store(myNote)

perform {

}

// This doesn't work if I have
// static object that points to a placeholder object
// The outer static object will not change so if something is reacting to it, that object won't change.
//
//
// How would I do this.
// actions.add(proxy)
