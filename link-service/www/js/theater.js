class Theater {

  msg = {'add': [], 'remove': []}
  domain = "theater.csail.mit.edu"

  constructor() {
    this.callbacks = {}

    // Open up a WebSocket with the server
    this.connected = false
    this.ws = new WebSocket(`wss://${this.domain}/attend`)
    this.ws.onopen    = this.onSocketOpen   .bind(this)
    this.ws.onmessage = this.onSocketMessage.bind(this)

    this.login()
  }

  async login() {
    // Generate a random client secret
    const client_secret = Math.random().toString(36).substr(2)

    // The client ID is it's hex hash
    const encoder = new TextEncoder()
    const client_secret_data = encoder.encode(client_secret)
    const client_id_buffer = await crypto.subtle.digest('SHA-256', client_secret_data)
    const client_id_array = Array.from(new Uint8Array(client_id_buffer))
    const client_id = client_id_array.map(b => b.toString(16).padStart(2, '0')).join('')

    // Open the login window
    var redirect_uri = `https://${this.domain}/login_redirect`
    redirect_uri = encodeURIComponent(redirect_uri)
    var state = encodeURIComponent("*")
    var login = window.open(`https://${this.domain}/login?client_id=${client_id}&redirect_uri=${redirect_uri}&state=${state}`)

    // Listen for messages from it
    window.addEventListener("message", (event) => {
      if (event.origin !==`https://${this.domain}`)
        return

      if (event.source !== login)
        return

      const code = event.data

      // Get a token from the code
      let form = new FormData();
      form.append('client_id', client_id)
      form.append('client_secret', client_secret)
      form.append('code', code)
      fetch(`https://${this.domain}/token`,
        {
          body: form,
          method: 'post'
        })
      .then(res => res.json())
      .then(data => {
        console.log(data)
        alert("logged in!")
      })
    }, {once: true});
  }

  async onSocketOpen(event) {
    this.connected = true
    this.updateAttending()
  }

  async onSocketMessage(event) {
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

  async updateAttending() {
    if (this.connected) {
      await this.ws.send(JSON.stringify(this.msg))
      this.msg['add'] = []
      this.msg['rem'] = []
    }
  }

  async attend(stages, callback) {
    this.msg['add'] = this.msg['add'].concat(stages)
    for (const stage of stages) {
      this.callbacks[stage] = callback
    }

    await this.updateAttending()
  }

  async unattend(stages, callback) {
    this.msg['rem'] = this.msg['rem'].concat(stages)

    await this.updateAttending()
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
