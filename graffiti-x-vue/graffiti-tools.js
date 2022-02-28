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

  async insert(object, near_misses=[], access=null) {
    return await this.auth.request('post', 'insert', {
      obj: object,
      near_misses: near_misses,
      access: access
    })
  }

  async queryMany(query, limit, skip=0, time=0) {
    return await this.auth.request('post', 'query_many', {
      query: query,
      time: time,
      limit: limit,
      skip: skip
    })
  }

  async queryOne(query, skip=0, time=0) {
    return await this.auth.request('post', 'query_one', {
      query: query,
      time: time,
      skip: skip
    })
  }
}

function querySubscriber(querySocket, queryMany) {
  return class {
    constructor(query, callback) {
      this.query = query
      this.callback = callback
      this.queryTime = null
      this.numPreceding = 0

      // Generate a random query ID
      this.queryID = Math.random().toString(16).substr(2, 14)
    }

    async open() {
      this.queryTime = await querySocket.addQuery(
        this.queryID,
        this.query,
        this.callback)
    }

    async close() {
      this.queryTime = null
      this.numPreceding = 0
      return await this.querySocket.removeQuery(this.queryID)
    }

    async rewind(limit) {
      // Open if we haven't already
      if (this.queryTime == null) {
        await this.open()
      }

      // Fetch #(limit) preceding query matches
      const preceding = await queryMany(
        this.query,
        limit,
        this.numPreceding,
        this.queryTime
      )
      this.numPreceding += preceding.length

      // Call the callback on each of them
      preceding.map(this.callback)

      // Return whether or not we have completed
      return preceding.length < limit
    }
  }
}
