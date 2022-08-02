import Graffiti from './graffiti-js-vanilla/graffiti.js'

export default async function(Vue, graffitiURL='https://graffiti.csail.mit.edu') {

  const graffiti = new Graffiti(graffitiURL)
  await graffiti.initialize()

  return {
    myID: graffiti.myID,
    toggleLogIn: graffiti.toggleLogIn.bind(graffiti),
    // A Vue composable
    useQuery(query) {

      // Initialize the collection output
      const objectMap = Vue.reactive({})

      // This functions is called when an object
      // is added or removed from the collection
      // either by the query subscription or locally
      function updateCallback(object) {
        const uuid = graffiti.objectUUID(object)

        // Store the original object if
        // one exists, in case of failure
        let originalObject = null
        if (uuid in objectMap) {
          originalObject = objectMap[uuid]
        }

        // Replace the object
        objectMap[uuid] = object

        // Return the original in case of failure
        return originalObject
      }

      // Likewise, this is called whenever an
      // object is removed either by the query or locally
      function removeCallback(object) {
        const uuid = graffiti.objectUUID(object)
        if (!(uuid in objectMap)) return
        delete objectMap[uuid]
      }

      // Initialize a query
      let queryID = null

      // Unsubscribe to the query when done
      Vue.onBeforeUnmount(() => { if (queryID) {
        graffiti.unsubscribe(queryID)
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
          await graffiti.unsubscribe(oldQueryID)
        }

        // Clear the output
        Object.keys(objectMap).forEach(k => delete objectMap[k])

        // And subscribe to the new query
        queryID = await graffiti.subscribe(
          newQuery,
          updateCallback,
          removeCallback)
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
        if (!graffiti.myID) {
          throw {
            type: 'error',
            content: 'you can\'t update objects without logging in!'
          }
        }

        // Give the object an _id, etc.
        graffiti.completeObject(object)

        // Immediately replace the object
        const originalObject = updateCallback(object)

        // Send it to the server
        try {
          await graffiti.update(object, query)
        } catch(e) {
          if (originalObject) {
            // Restore the original object
            updateCallback(originalObject)
          } else {
            // Delete the temp object
            removeCallback(object)
          }
          throw e
        }

        return object
      }

      // And this one is the exposed deletion function
      async function remove(object) {
        if (!graffiti.myID) {
          throw {
            type: 'error',
            content: 'you can\'t remove objects without logging in!'
          }
        }

        const uuid = graffiti.objectUUID(object)
        if (!(uuid in objectMap)) {
          throw {
            type: 'error',
            content: 'the object ID you\'re trying to remove is not in this collection',
            id
          }
        }

        // Immediately remove the object
        // but store it in case there is an error
        const originalObject = objectMap[uuid]
        removeCallback(object)

        try {
          await graffiti.remove(object._id)
        } catch(e) {
          // Delete failed, restore the object
          updateCallback(originalObject)
          throw e
        }

        return originalObject
      }

      // Finally, we only want an array not an object
      const objects = Vue.computed(() => Object.values(objectMap))

      // Return the reactive object array and
      // the exposed modification functions
      return {
        objects,
        update,
        remove
      }
    }
  }
}
