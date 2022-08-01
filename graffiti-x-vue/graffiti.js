export default async function(Vue, graffitiURL='https://graffiti.csail.mit.edu') {

  const socket = new Socket(graffitiURL)
  await socket.initialize()

  // A Vue composable
  return function(query) {

    // Initialize the collection output
    const objectMap = Vue.reactive({})
    // and an event stream
    const eventTarget = new EventTarget()

    // This functions is called when an object
    // is added or removed from the collection
    // either by the query subscription or locally
    async function updateCallback(object) {
      const uuid = socket.objectUUID(object)

      // Store the original object if
      // one exists, in case of failure
      let originalObject = null
      if (uuid in objectMap) {
        originalObject = objectMap[uuid]
      }

      // Replace the object
      objectMap[uuid] = object

      // Send a local event if the update was ours
      if (object._by == socket.myID) {
        eventTarget.dispatchEvent(new Event(uuid))
      }

      // Return the original in case of failure
      return originalObject
    }

    // Likewise, this is called whenever an
    // object is deleted either by the query or locally
    function deleteCallback(object) {
      const uuid = socket.objectUUID(object)
      if (!(uuid in objectMap)) return
      delete objectMap[uuid]
    }

    // Initialize a query
    let queryID = null

    // Unsubscribe to the query when done
    Vue.onBeforeUnmount(() => { if (queryID) {
      socket.unsubscribe(queryID)
    }})

    async function queryHandler(newQuery, oldQuery) {
      // Don't run on null queries
      if (!newQuery) return

      // Don't update if the query hasn't actually changed
      // (it can get triggered twice because of immediate)
      const newQueryJSON = JSON.stringify(newQuery)
      const oldQueryJSON = JSON.stringify(oldQuery)
      if (newQueryJSON == oldQueryJSON) return

      // Unsubscribe to the existing query
      if (queryID) {
        const oldQueryID = queryID
        queryID = null
        await socket.unsubscribe(oldQueryID)
      }

      // Clear the output
      Object.keys(objectMap).forEach(k => delete objectMap[k])

      // And subscribe to the new query
      queryID = await socket.subscribe(
        newQuery,
        updateCallback,
        deleteCallback)
    }

    // Subscribe to the query using the handler
    if (Vue.isReactive(query)) {
      Vue.watch(query, queryHandler, { deep: true, immediate: true })
    } else {
      // Avoid watch overhead and just run once
      queryHandler(query, {})
    }

    // This exposed function lets users
    // modify graffiti objects
    async function update(object) {
      if (!socket.loggedIn) {
        throw {
          type: 'error',
          content: 'you can\'t update objects without logging in!'
        }
      }

      // Give the object an _id, etc.
      socket.completeObject(object)

      // Immediately replace the object
      const originalObject = updateCallback(object)

      // Send it to the server
      try {
        await socket.update(object)
      } catch(e) {
        if (originalObject) {
          // Restore the original object
          updateCallback(originalObject)
        } else {
          // Delete the temp object
          deleteCallback(object)
        }
        throw e
      }

      // Listen if the ID actually gets added to the collection
      const updatePromise = new Promise( (resolve, reject) => {
        eventTarget.addEventListener(socket.objectUUID(object), () => resolve() )
        // But if it takes too long, timeout
        setTimeout(() => reject(new Error('timeout')), 5000)
      })

      try {
        await updatePromise
      } catch {
        deleteCallback(object)
        socket.delete(object._id)
        throw {
          type: 'error',
          content: 'the object you updated isn\'t included in this collection, so it has been deleted',
          object
        }
      }

      return object
    }

    // And this one is the exposed deletion function
    async function delete_(object) {
      if (!socket.loggedIn) {
        throw {
          type: 'error',
          content: 'you can\'t delete objects without logging in!'
        }
      }

      const uuid = socket.objectUUID(object)
      if (!(uuid in objectMap)) {
        throw {
          type: 'error',
          content: 'the object ID you\'re trying to delete is not in this collection',
          id
        }
      }

      // Immediately delete the object
      // but store it in case there is an error
      const originalObject = objectMap[uuid]
      deleteCallback(object)

      try {
        await socket.delete(object._id)
      } catch(e) {
        // Delete failed, restore the object
        updateCallback(originalObject)
        throw e
      }
    }

    // Finally, we only want an array not an object
    const objects = Vue.computed(() => Object.values(object.map))

    // Return the map,
    // the exposed modification functions,
    // and authorization functions
    return {
      objects,
      update,
      delete_,
      myID: socket.myID,
      loggedIn: socket.loggedIn,
      logOut: socket.logOut,
      logIn: socket.logIn
    }
  }
}
