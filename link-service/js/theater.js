class Theater {

  #msg = {'add': [], 'remove': []}

  constructor() {
    this.callbacks = {}

    // Open up a WebSocket with the server
    this.connected = false
    this.ws = new WebSocket("ws://localhost:5000/attend")
    this.ws.onopen    = this.#onSocketOpen   .bind(this)
    this.ws.onmessage = this.#onSocketMessage.bind(this)
  }

  async #onSocketOpen(event) {
    this.connected = true
    this.#updateAttending()
  }

  async #onSocketMessage(event) {
    const data = JSON.parse(event.data)

    // Send each action to the appropriate callback
    if ('observed' in data) {
      const stages = data['observed']
      for (const stage in stages) {
        const actions = stages[stage]
        for (const action of actions) {
          this.callbacks[stage](stage, action)
        }
      }
    }
  }

  async #updateAttending() {
    if (this.connected) {
      await this.ws.send(JSON.stringify(this.#msg))
      this.#msg['add'] = []
      this.#msg['rem'] = []
    }
  }

  async attend(stages, callback) {
    this.#msg['add'] = this.#msg['add'].concat(stages)
    for (const stage of stages) {
      this.callbacks[stage] = callback
    }

    this.#updateAttending()
  }

  async unattend(stages, callback) {
    this.#msg['rem'] = this.#msg['rem'].concat(stages)
    this.#updateAttending()
  }

}

// TODO
//
// Add a login so you can do things like:
//
// self.perform.create(location, url)
// self.perform.delete(location, url)
// self.perform.update(location, url)
//
// Pod functions
// url = self.put.note(message)
//       self.delete(url)
//       get(url)
//
// and reference private variables like
// th.attend(['~mythings'], myCallback)
//
// There are multiple costumes once you login
// that define different actor profiles
