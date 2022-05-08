import Auth from './src/auth.js'
import QuerySocket from './src/query-socket.js'
import { clientFormat, serverFormat } from './src/object-formatting.js'

export default class GraffitiTools {

  constructor(origin) {
    this.origin = origin
    this.rewindQueries = {}

    this.auth = new Auth(this.origin)
    this.querySocket = new QuerySocket(this.origin, this.auth)
  }

  logIn() {
    this.auth.logIn()
  }

  logOut() {
    this.auth.logOut()
  }

  async loggedIn() {
    return this.auth.loggedIn()
  }

  async myID() {
    return await this.auth.myID()
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
    const data = await this.auth.request('post', 'query_many', {
      query, limit, sort
    })
    return data.map(clientFormat)
  }

  async queryOne(query, sort) {
    const data = await this.auth.request('post', 'query_one', {
      query, sort
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
      // Clear the results
      for (var r in results) delete results[r]

      // Reset poll queries and store the query
      query = q
      queryStart = await this.now()
      pollQueries = {}

      // If we're live, start subscribing
      if (live) {
        await this.querySocket.updateQuery(
          queryID,
          query,
          result => results[result._id] = result,
          resultID => delete results[resultID]
        )
      }
    }).bind(this)

    // Add a hook to properly close the query
    const delete_ = (async function() {
      if (live) {
        this.querySocket.deleteQuery(queryID)
      }
    }).bind(this)

    const poll = (async function(direction, limit) {
      if (limit == 0) return true

      const comparator = (direction < 0) ? "$lt" : "$gt"

      if (!(comparator in pollQueries)) {
        pollQueries[comparator] =
          { _timestamp: { [comparator]: queryStart } }
      }

      // Fetch #(limit) preceding query matches
      const earlier = await this.queryMany(
        { "$and": [query, pollQueries[comparator] ] },
        limit,
        [['_timestamp', direction], ['_id', -1]]
      )

      // If there are any matches
      if (earlier.length) {
        // Call the update callback on each of them
        earlier.map(result => results[result._id] = result)

        // Get the earliest match
        const earliest = earlier[earlier.length-1]

        // And next time only look for things even earlier
        pollQueries[comparator] = { "$or": [
          { _timestamp: { [comparator]: earliest._timestamp } },
          {
            _timestamp: { "$eq": earliest._timestamp },
            _id: { "$lt": earliest._id }
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
