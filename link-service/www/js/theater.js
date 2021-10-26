class Theater {

  msg = {'add': [], 'remove': []}
  domain = "theater.csail.mit.edu"
  token = null

  constructor() {
    this.callbacks = {}

    // Open up a WebSocket with the server
    this.connected = false
    this.ws = new WebSocket(`wss://${this.domain}/attend`)
    this.ws.onopen    = this.onSocketOpen   .bind(this)
    this.ws.onmessage = this.onSocketMessage.bind(this)
  }

  async perform(stage, action) {
    const token = await this.get_token()

    action = encodeURIComponent(JSON.stringify(action))
    await fetch(`https://${this.domain}/perform?stage=${stage}&action=${action}`, {
      method: 'post',
      headers: new Headers({
        'Authorization': 'Bearer ' + token
      }),
    })
  }

  async get_token() {
    // If the token exists, just use it
    if (this.token) return this.token

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
    const state = encodeURIComponent("*")
    const auth_window = window.open(`https://${this.domain}/login?client_id=${client_id}&redirect_uri=${redirect_uri}&state=${state}`)

    // Create a callback function to parse the
    // code event and retrieve the token.
    async function code_to_token(th, event, resolve) {
      // Make sure the message is from theater
      if (event.origin !==`https://${th.domain}`)
        return
      // And that it is from the same window as expected
      if (event.source !== auth_window)
        return

      window.removeEventListener("message", code_to_token)

      // Construct the body of the POST
      const code = event.data
      let form = new FormData();
      form.append('client_id', client_id)
      form.append('client_secret', client_secret)
      form.append('code', code)

      // Ask to exchange the code for a token
      const response = await fetch(`https://${th.domain}/token`, {
          body: form,
          method: 'post'})
      const data = await response.json()

      // Store and return the token
      const token = data.access_token
      th.token = token
      resolve(token)
    }

    // Listen for the code
    return new Promise((resolve, reject) => {
      window.addEventListener("message",
        event => code_to_token(this, event, resolve))
    })
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
          try {
            const action_json = JSON.parse(action)
            this.callbacks[stage](stage, action_json)
          } catch (error) {
          }
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
