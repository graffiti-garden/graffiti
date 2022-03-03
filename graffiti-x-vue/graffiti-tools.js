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

  async now() {
    return await this.querySocket.now()
  }

  async insert(object, nearMisses, access) {
    return await this.auth.request('post', 'insert', {
      object: object,
      near_misses: nearMisses,
      access: access
    })
  }

  async replace(object, nearMisses, access) {
    return await this.auth.request('post', 'replace', {
      object: object,
      near_misses: nearMisses,
      access: access
    })
  }

  async delete(objectID) {
    return await this.auth.request('post', 'delete', {
      object_id: objectID
    })
  }

  async queryMany(query, limit, sort) {
    return await this.auth.request('post', 'query_many', {
      query: query,
      limit: limit,
      sort: sort
    })
  }

  async queryOne(query, sort) {
    return await this.auth.request('post', 'query_one', {
      query: query,
      sort: sort
    })
  }
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
        updateCallback,
        deleteCallback
      )
    }

    async close() {
      return await this.querySocket.removeQuery(this.queryID)
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
        const earliest = earlier[earlier.length-1].object

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
      return earlier.length < limit
    }
  }
}
