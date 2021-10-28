export default class Attend {

  constructor(domain) {
    // Initialize
    this.domain = domain
    this.stages = {}
    this.callbacks = {}
    this.connected = false

    // Open up a WebSocket with the server
    this.connect()
  }

  async add(stage, callback) {
    this.stages[stage] = '0'
    this.callbacks[stage] = callback
    await this.updateAttending()
  }

  async del(stage, callback) {
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
          try {
            const action_json = JSON.parse(action)
            this.callbacks[stage](stage, action_json)
          } catch (error) {
            // TODO
          }
        }
      }
    }

    if ('stages' in data) {
      this.stages = data['stages']
    }
  }

  async connect() {
    this.ws = new WebSocket(`wss://${this.domain}/attend`)
    this.ws.onopen    = this.onSocketOpen   .bind(this)
    this.ws.onmessage = this.onSocketMessage.bind(this)
    this.ws.onclose   = this.onSocketClose  .bind(this)
    this.ws.onerror   = this.onSocketError  .bind(this)
  }

  async onSocketOpen(event) {
    console.log('Attend socket is open.')
    this.connected = true
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
