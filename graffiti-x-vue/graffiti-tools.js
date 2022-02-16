import Auth from './auth.js'
import Query from './query.js'

export default class GraffitiTools {

  constructor(origin) {
    this.origin = origin
    this.auth = new Auth(this.origin)
    this.query = new Query(this.origin, this.auth)
  }

  async put(object, near_misses=[], access=null) {
    return await this.auth.request('put', 'put', {
      obj: JSON.stringify(object),
      near_misses: JSON.stringify(near_misses),
      access: access
    })
  }

  async addQuery(query_id, query, callback) {
    this.query.addQuery(query_id, query, callback)
  }
}
