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

  async insert(object, nearMisses=[], access=null) {
    return await this.auth.request('post', 'insert', {
      obj: object,
      near_misses: nearMisses,
      access: access
    })
  }

  async replace(objectID, object, nearMisses=[], access=null) {
    return await this.auth.request('post', 'replace', {
      obj_id: objectID,
      obj: object,
      near_misses: nearMisses,
      access: access
    })
  }

  async delete(objectID) {
    return await this.auth.request('post', 'delete', {
      obj_id: objectID
    })
  }

  async queryMany(query, limit, skip=0) {
    return await this.auth.request('post', 'query_many', {
      query: query,
      limit: limit,
      skip: skip
    })
  }

  async queryOne(query, skip=0) {
    return await this.auth.request('post', 'query_one', {
      query: query,
      skip: skip
    })
  }
}

function querySubscriber(querySocket, queryMany) {
  return class {
    constructor(query) {
      this.query = query
      this.numPreceding = 0

      // Generate a random query ID
      this.queryID = Math.random().toString(16).substr(2, 14)
    }

    async open(updateCallback, deleteCallback) {
      this.updateCallback = updateCallback
      const queryTime = await querySocket.addQuery(
        this.queryID,
        this.query,
        updateCallback,
        deleteCallback
      )
      this.query.created = { "$lte": parseFloat(queryTime) }
    }

    async close() {
      this.numPreceding = 0
      return await this.querySocket.removeQuery(this.queryID)
    }

    async rewind(limit) {
      // Fetch #(limit) preceding query matches
      const preceding = await queryMany(
        this.query,
        limit,
        this.numPreceding
      )
      this.numPreceding += preceding.length

      // Call the update callback on each of them
      preceding.map(this.updateCallback)

      // Return whether or not we have completed
      return preceding.length < limit
    }
  }
}
