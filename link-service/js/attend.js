export default class Attend {

  constructor(origin, auth) {
    // Initialize
    this.origin = origin
    this.auth = auth
    this.stages = {}
    this.callbacks = {}
    this.connected = false

    // Open up a WebSocket with the server
    this.connect()
  }

  async add(stage, callback) {
    // Attend a stage
    this.stages[stage] = '0'
    this.callbacks[stage] = callback
    await this.updateAttending()
  }

  async del(stage, callback) {
    // Stop attending a stage
    if (this.stages.hasKey(stage)) {
      delete this.stages[stage]
      delete this.clallbacks[stage]
      await this.updateAttending()
    }
  }

  async updateAttending() {
    if (this.connected) {
      await this.ws.send(JSON.stringify({'stages': this.stages}))
    }
  }

  async onSocketMessage(event) {
    const data = JSON.parse(event.data)

    // Send each action to the appropriate callback
    if ('actions' in data) {
      const actionStages = data['actions']
      for (const stage in actionStages) {
        const actions = actionStages[stage]
        for (const action of actions) {
          this.callbacks[stage](stage, action)
        }
      }
    }

    // Update the latest ID received in each
    // stage so we don't get the same message
    // more than once, even if we reconnect.
    if ('stages' in data) {
      this.stages = data['stages']
    }
  }

  async connect() {
    const token = await this.auth.token
    const wsURL = new URL('attend', this.origin)
    if (wsURL.protocol == 'https:') {
      wsURL.protocol = 'wss:'
    } else {
      wsURL.protocol = 'ws:'
    }
    wsURL.searchParams.set('token', token)
    this.ws = new WebSocket(wsURL)
    this.ws.onopen    = this.onSocketOpen   .bind(this)
    this.ws.onmessage = this.onSocketMessage.bind(this)
    this.ws.onclose   = this.onSocketClose  .bind(this)
    this.ws.onerror   = this.onSocketError  .bind(this)
  }

  async onSocketOpen(event) {
    console.log('Attend socket is open.')
    this.connected = true

    // Send updates to the attendance list
    // that haven't gotten through yet
    this.updateAttending()
  }

  async onSocketClose(event) {
    console.log('Attend socket is closed. Will attempt to reconnect in 5 seconds...')
    this.connected = false
    setTimeout(this.connect.bind(this), 5000)
  }

  async onSocketError(error) {
    this.ws.close();
  }

}
