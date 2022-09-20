import Graffiti from './graffiti-x-js/graffiti.js'

export default async function(Vue, graffitiURL='https://graffiti.garden') {

  const graffiti = new Graffiti(graffitiURL)
  await graffiti.initialize()

  return {
    myID: graffiti.myID,
    toggleLogIn: graffiti.toggleLogIn.bind(graffiti),
    // A Vue composable
    useCollection(query, flags={}) {

      // Initialize the collection output
      const objectMap = Vue.reactive({})

      // Initialize content addresses for collection members
      const objectMapContentAddresses = Vue.reactive({})
      const encoder = new TextEncoder()

      // This functions is called when an object
      // is added or removed from the collection
      // either by the query subscription or locally
      function updateCallback(object) {
        const uuid = graffiti.objectUUID(object)

        // Store the original object if
        // one exists, in case of failure
        const originalObject = (uuid in objectMap)?
          objectMap[uuid] : null

        // Add properties to the object
        // so it can be updated and removed
        // without the collection
        if (!object._update) {
          Object.defineProperty(object, '_update', { value: ()=>update(object) })
          Object.defineProperty(object, '_remove', { value: ()=>remove(object) })
          Object.defineProperty(object, '_contentAddress', { get: ()=>Vue.computed(()=> {
            return (uuid in objectMapContentAddresses)?
              objectMapContentAddresses[uuid] : null
          })})
        }

        // Replace the object
        objectMap[uuid] = object

        // Compute it's content address
        const inputBytes = encoder.encode(JSON.stringify(object))
        crypto.subtle.digest('SHA-256', inputBytes).then(outputBuffer=>{
          const outputArray = Array.from(new Uint8Array(outputBuffer))
          objectMapContentAddresses[uuid] =
            outputArray.map(b => b.toString(16).padStart(2, '0')).join('')
        })

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
          removeCallback,
          flags)
      }

      // Subscribe to the query using the handler
      if (Vue.isRef(query) || Vue.isReactive(query) || typeof query == 'function') {
        Vue.watch(query, queryHandler, { deep: true, immediate: true })
      } else {
        queryHandler(query)
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
          const queryObj = 
            (typeof query == 'function')? query() :
            Vue.isRef(query)? query.value : query
          await graffiti.update(object, queryObj)
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


      // Extend the array class to expose update
      // and remove functions, plus provide some
      // useful helper methods
      class Collection extends Array {

        get mine() {
          return this.filter(o=> o._by==graffiti.myID)
        }

        get authors() {
          return [...new Set(this.map(o=> o._by))]
        }

        async removeMine() {
          await Promise.all(
            this.mine.map(async o=> await this.remove(o)))
        }

        #getProperty(obj, propertyPath) {
          // Split it up by periods
          propertyPath = propertyPath.match(/([^\.]+)/g)
          // Traverse down the path tree
          for (const property of propertyPath) {
            obj = obj[property]
          }
          return obj
        }

        sortBy(propertyPath) {

          const sortOrder = propertyPath[0] == '-'? -1 : 1
          if (sortOrder < 0) propertyPath = propertyPath.substring(1)

          return this.sort((a, b)=> {
            const propertyA = this.#getProperty(a, propertyPath)
            const propertyB = this.#getProperty(b, propertyPath)
            return sortOrder * (
              propertyA < propertyB? -1 : 
              propertyA > propertyB?  1 : 0 )
          })
        }

        groupBy(propertyPath) {
          return this.reduce((chain, obj)=> {
            const property = this.#getProperty(obj, propertyPath)
            if (property in chain) {
              chain[property].push(obj)
            } else {
              chain[property] = new Collection(obj)
            }
            return chain
          }, {})
        }
      }
      Collection.prototype.update = update
      Collection.prototype.remove = remove

      // And return a collection
      return Vue.computed(() => new Collection(...Object.values(objectMap)))
    }
  }
}
