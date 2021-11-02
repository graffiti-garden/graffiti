import Attend  from './attend.js'
import Auth    from './auth.js'
import Pod     from './pod.js'

export default class Theater {

  constructor(domain) {
    this.auth   = new Auth  (domain)
    this.attend = new Attend(domain)
    this.pod    = new Pod   (this.auth)
  }

  async perform(stage, action) {
    action = encodeURIComponent(JSON.stringify(action))
    await this.auth.request('post', `perform?stage=${stage}&action=${action}`)
  }

  async retire(stage, action) {
    action = encodeURIComponent(JSON.stringify(action))
    await this.auth.request('post', `retire?stage=${stage}&action=${action}`)
  }
}
