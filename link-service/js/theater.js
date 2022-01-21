
export default {
  install(app, origin) {
    app.mixin({

      data() {
        return {
          cache: {},
          foo: "foo"
        }
      },

      methods: {

        handlerGet(obj, property, receiver) {
          if (property == "foo") {
            console.log("i'm fooing")
            return this.foo
          }
          return Reflect.get(...arguments);
        },

        put(address, value) {
          // Check to see if it's already in the cache
          if ( !(address in this.cache) ) {
            // Store it in the cache
            this.cache.address = value
          }

          const podHandler = {
            get: this.handlerGet.bind(this)
          }

          console.log(this.foo)

          return new Proxy(this.cache.address, podHandler)
        },

        flipFoo() {
          if (this.foo == "foo") {
            this.foo = "bar"
          } else {
            this.foo = "foo"
          }
        }

      }
    });
  }
}
