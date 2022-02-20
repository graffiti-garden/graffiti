import Auth from './auth.js'
import QuerySocket from './query-socket.js'

export default class GraffitiTools {

  constructor(origin) {
    this.origin = origin
    this.auth = new Auth(this.origin)
    this.querySocket = new QuerySocket(this.origin, this.auth)
  }

  async insert(object, near_misses=[], access=null) {
    return await this.auth.request('post', 'insert', {
      obj: object,
      near_misses: near_misses,
      access: access
    })
  }

  async queryMany(query, time=0, limit=100, skip=0) {
    return await this.auth.request('post', 'query_many', {
      query: query,
      time: time,
      limit: limit,
      skip: skip
    })
  }

  async queryOne(query, time=0, skip=0) {
    return await this.auth.request('post', 'query_one', {
      query: query,
      time: time,
      skip: skip
    })
  }

  async querySocketAdd(query_id, query, callback) {
    return await this.querySocket.addQuery(query_id, query, callback)
  }

  async querySocketRemove(query_id) {
    return await this.querySocket.removeQuery(query_id)
  }
}
