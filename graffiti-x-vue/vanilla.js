import Auth from './src/auth.js'
import QuerySocket from './src/query-socket.js'
import { clientFormat, serverFormat } from './src/object-formatting.js'

export default class GraffitiTools {

  constructor(origin) {
    this.origin = origin
    this.rewindQueries = {}

    this.auth = new Auth(this.origin)
    this.querySocket = new QuerySocket(this.origin, this.auth)
    this.querySocket.connect()
  }

  get myID() {
    return this.auth.myID
  }

  get loggedIn() {
    return this.auth.loggedIn
  }

  async logIn() {
    if (await this.auth.logIn()) {
      this.querySocket.connect()
      await this.querySocket.isInitialized()
      return true
    } else {
      return false
    }
  }

  logOut() {
    this.auth.logOut()
    this.querySocket.disconnect()
  }

  now() {
    return this.querySocket.now()
  }

  async update(object) {
    return await this.auth.request('post', 'update', serverFormat(object, this.now()))
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

  QuerySubscriber(results, live=false) {
    // Generate a random query ID
    const queryID = Math.random().toString(16).substr(2, 14)

    let query = {}
    let queryStart = 0
    let pollQueries = {}

    // Supply a function that updates the query
    const update = (async function(q) {
      await this.querySocket.isInitialized()

      // Clear the results
      for (var r in results) delete results[r]

      // Reset poll queries and store the query
      query = q
      queryStart = this.now()
      pollQueries = {}

      // If we're live, start subscribing
      if (live) {
        await this.querySocket.updateQuery(
          queryID,
          query,
          result => results[result.id] = result,
          resultID => delete results[resultID]
        )
      }
    }).bind(this)

    // Add a hook to properly close the query
    const delete_ = (async function() {
      await this.querySocket.isInitialized()

      if (live) {
        this.querySocket.deleteQuery(queryID)
      }
    }).bind(this)

    const poll = (async function(direction, limit) {
      await this.querySocket.isInitialized()

      if (limit == 0) return true

      const comparator = (direction < 0) ? "$lt" : "$gt"

      if (!(comparator in pollQueries)) {
        pollQueries[comparator] =
          { "timestamp": { [comparator]: queryStart } }
      }

      // Fetch #(limit) preceding query matches
      const earlier = await this.queryMany(
        { "$and": [query, pollQueries[comparator] ] },
        limit,
        [['timestamp', direction], ['$id', -1]]
      )

      // If there are any matches
      if (earlier.length) {
        // Call the update callback on each of them
        earlier.map(result => results[result.id] = result)

        // Get the earliest match
        const earliest = earlier[earlier.length-1]

        // And next time only look for things even earlier
        pollQueries[comparator] = { "$or": [
          { "timestamp": { [comparator]: earliest.timestamp } },
          {
            "timestamp": { "$eq": earliest.timestamp },
            "$id": { "$lt": earliest['$id'] }
          }
        ]}
      }

      // Return whether or not we have completed
      return earlier.length == limit
    }).bind(this)

    // And finally add a function that lets you rewind the query
    const rewind = (async function(limit=100) {
      return await poll(-1, limit)
    }).bind(this)

    const play = (async function(limit=100) {
      if (!live) return await poll(1, limit)
    }).bind(this)

    return { update, delete: delete_, rewind, play }
  }
}
