import Auth from './auth.js'
import QuerySocket from './query-socket.js'

export default class GraffitiTools {

  constructor(origin) {
    this.origin = origin
    this.auth = new Auth(this.origin)
    this.querySocket = new QuerySocket(this.origin, this.auth)
    this.QuerySubscriber = querySubscriber(
      this.querySocket,
      this.queryMany.bind(this))
  }

  get mySignature() {
    return (async () => {
      return await this.auth.mySignature
    })()
  }

  logOut() {
    this.auth.logOut()
  }

  async now() {
    return await this.querySocket.now()
  }

  async update(object) {
    return await this.auth.request('post', 'update', serverFormat(object))
  }

  async delete(objectID) {
    return await this.auth.request('post', 'delete', {
      object_id: objectID
    })
  }

  async queryMany(query, limit, sort) {
    let data = await this.auth.request('post', 'query_many', {
      query: query,
      limit: limit,
      sort: sort
    })
    return data.map(clientFormat)
  }

  async queryOne(query, sort) {
    let data = await this.auth.request('post', 'query_one', {
      query: query,
      sort: sort
    })
    return clientFormat(data)
  }
}

function serverFormat(object) {
  // Copy the object so we don't modify the original
  let objectCopy = Object.assign({}, object)

  // Extract fields from the object
  // (they're passed in separately on the
  // server for type verification)
  delete objectCopy.nearMisses
  delete objectCopy.access
  return {
    object: objectCopy,
    near_misses: object.nearMisses,
    access: object.access
  }
}

function clientFormat(data) {
  if (!data) return data
  let object = data.object
  object.nearMisses = data.near_misses
  object.access = data.access
  return object
}

function querySubscriber(querySocket, queryMany) {
  return class {
    constructor(query, updateCallback, deleteCallback) {
      this.query = query
      this.updateCallback = updateCallback
      this.beforeEarliest = {}

      // Generate a random query ID
      this.queryID = Math.random().toString(16).substr(2, 14)

      querySocket.addQuery(
        this.queryID,
        query,
        x => updateCallback(clientFormat(x)),
        deleteCallback
      )
    }

    async close() {
      return await querySocket.removeQuery(this.queryID)
    }

    async rewind(limit) {
      // Fetch #(limit) preceding query matches
      const earlier = await queryMany(
        { "$and": [ this.query, this.beforeEarliest ] },
        limit
      )

      // If there are any matches
      if (earlier.length) {
        // Call the update callback on each of them
        earlier.map(this.updateCallback)

        // Get the earliest match
        const earliest = earlier[earlier.length-1]

        // And next time only look for things even earlier
        this.beforeEarliest = { "$or": [
          { "timestamp": { "$lt": earliest.timestamp } },
          {
            "timestamp": { "$eq": earliest.timestamp },
            "id": { "$lt": earliest.id }
          }
        ]}
      }

      // Return whether or not we have completed
      return earlier.length == limit
    }
  }
}
