import Auth from './auth.js'

export default class Pod {

  constructor(auth) {
    this.auth = auth
  }

  async get(path) {
    return await this.auth.request('get', `pod/${path}`)
  }

  async put(data, path) {
    data = encodeURIComponent(JSON.stringify(data))
    await this.auth.request('put', `pod/${path}?data=${data}`)
  }

}
