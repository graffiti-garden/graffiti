import Attend  from './attend.js'
import Auth    from './auth.js'

export default class Theater {

  constructor(origin) {
    this.auth   = new Auth  (origin)
    this.attend = new Attend(origin, this.auth)
  }

  async get(path) {
    return await this.auth.request('get', 'get', {path: path})
  }

  async hash(path) {
    return await this.auth.request('post', 'hash', {path: path})
  }

  async put(data) {
    return await this.auth.request('post', 'put', {
      data: JSON.stringify(data)
    })
  }

  async perform(stage, action) {
    return await this.auth.request('post', 'perform', {
      stage: stage,
      action: JSON.stringify(action)
    })
  }

  async retire(stage, action) {
    await this.auth.request('post', 'retire', {
      hash: hash
    })
  }

}
