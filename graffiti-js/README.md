# Graffiti for Vanilla Javascript

This is the base Javascript library that interfaces with the [Graffiti server](https://github.com/csail-graffiti/server).
We recommend not using this vanilla library itself but instead using framework plugins that are built on top of it like the [Graffiti plugin for Vue.JS](https://github.com/csail-graffiti/graffiti-js-vue).

Example usage: 

```javascript
import GraffitiSocket from "https://csail-graffiti.github.io/graffiti-js-vanilla/socket.js"

// You can initialize a connection to the graffiti server
const gs = GraffitiSocket()
await gs.initialize()

// You can subscribe to queries
const queryID = await gs.subscribe({
    type: 'post',
    content: { $type: 'string' }
  }
  // With an arbitrary update callback
  (obj) => console.log(`An object has been created: {obj}`),
  // and remove callback
  (obj) => console.log(`An object with id {obj._id} by user {obj._by} has been removed.`)
)

// And then unsubscribe to those queries
await gs.unsubscribe(queryID)

// You can log in and out and check your logged-in status
gs.logIn()
gs.logOut()
if (gs.loggedIn) {
  // ...
}

// When you are logged in you can reference your user ID
console.log(gs.myID)

// And when you are logged in you can
// create objects,
const myCoolPost = {
  type: 'post',
  content: 'hello world'
}
// ("completing" an object annotates
//  it with your user ID and a random
//  object ID, required by the server)
gs.complete(myCoolPost)
await gs.update(myCoolPost)

// replace objects,
myCoolPost.content += '!!!'
await gs.update(myCoolPost)

// and remove objects.
await gs.remove(myCoolPost)
```
