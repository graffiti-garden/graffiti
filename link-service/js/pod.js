import Auth from './auth.js'

export default class Pod {

  constructor(auth) {
    this.auth = auth
  }

  async get(path) {
    path = encodeURIComponent(path)
    return await this.auth.request('get', `get?path=${path}`)
  }

  async put(data, path) {
    path = encodeURIComponent(path)
    data = encodeURIComponent(JSON.stringify(data))
    return await this.auth.request('put', `put?path=${path}&data=${data}`)
  }

}
