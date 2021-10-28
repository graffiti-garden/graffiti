export default class Auth {

  constructor(domain) {
    this.domain = domain
    this.token = null
  }

  async request(method, query) {
    // Get a token if one doesn't exist
    if (this.token == null) {
      await this.authorize()
    }

    await fetch(`https://${this.domain}/${query}`, {
      method: 'post',
      headers: new Headers({
        'Authorization': 'Bearer ' + this.token
      }),
    })
  }

  async authorize() {
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
          method: 'post'
      })
      const data = await response.json()

      // Store and return the token
      th.token = data.access_token
      resolve(token)
    }

    // Listen for the code
    return new Promise((resolve, reject) => {
      window.addEventListener("message",
        event => code_to_token(this, event, resolve))
    })
  }
}
