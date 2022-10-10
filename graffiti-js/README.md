# Graffiti for Vanilla Javascript

This is the base Javascript library that interfaces with the [Graffiti server](https://github.com/graffiti-garden/server).
We recommend not using this vanilla library itself but instead using framework plugins that are built on top of it like the [Graffiti plugin for Vue.JS](https://github.com/graffiti-garden/graffiti-x-vue).

Example usage: 

```javascript
import Graffiti from "https://graffiti-garden.github.io/graffiti-x-js/graffiti.js"

// You can initialize a connection to the graffiti server
const graffiti = Graffiti()
await graffiti.initialize()

// You can subscribe to queries
const queryID = await graffiti.subscribe({
    type: 'post',
    content: { $type: 'string' }
  }
  // With an arbitrary update callback
  (obj) => console.log(`An object has been created: {obj}`),
  // and remove callback
  (obj) => console.log(`An object with id {obj._id} by user {obj._by} has been removed.`)
)

// And then unsubscribe to those queries
await graffiti.unsubscribe(queryID)

// You can toggle logging in and out
graffiti.toggleLogIn()

// When you are logged in you can reference your user ID
console.log(graffiti.myID)

// And when you are logged in you can
// create objects,
const myCoolPost = {
  type: 'post',
  content: 'hello world'
}
// ("completing" an object annotates
//  it with your user ID and a random
//  object ID, required by the server)
graffiti.complete(myCoolPost)
await graffiti.update(myCoolPost, {})

// replace objects,
myCoolPost.content += '!!!'
await graffiti.update(myCoolPost, {})

// and remove objects.
await graffiti.remove(myCoolPost)

// The second argument in the update
// function is a query. If the object you
// try to add does not match the query
// it will be rejected. This prevents
// you from accidentally creating data
// that gets "lost".
const query = { type: 'post' }
const myPost = { type: 'post' }
const myNotPost = { type: 'notpost' }
graffiti.complete(myNotPost)
// This works
await graffiti.update(myPost, query)
// But this won't work!
await graffiti.update(myNotPost, query)
```
