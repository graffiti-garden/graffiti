export default class Auth {

  constructor(origin) {
    this.origin = origin

    // Check to see if we are already logged in
    this.token = window.localStorage.getItem('graffitiToken')
    this.myID  = window.localStorage.getItem('graffitiID')

    if (!this.loggedIn) {
      // Check to see if we are redirecting back
      const url = new URL(window.location)

      if (url.searchParams.has('code')) {
        // Extract the code and state from the URL and strip it from the history
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        url.searchParams.delete('code')
        url.searchParams.delete('state')
        window.history.replaceState({}, '', url)

        // Get stored variables and remove them
        const clientSecret = window.sessionStorage.getItem('graffitiClientSecret')
        const clientID     = window.sessionStorage.getItem('graffitiClientID')
        const storedState  = window.sessionStorage.getItem('graffitiAuthState')
        window.sessionStorage.removeItem('graffitiClientSecret')
        window.sessionStorage.removeItem('graffitiClientID')
        window.sessionStorage.removeItem('graffitiAuthState')

        // Make sure state has been preserved
        if (state != storedState) {
          this.authorizationError('Wrong state!')
        }

        this.codeToToken(code, clientID, clientSecret)

        alert("logged in!")
      }
    }
  }

  get loggedIn() {
    return (this.token != null) && (this.myID != null)
  }

  async logIn() {
    if (this.loggedIn) return

    // Generate a random client secret and state
    const clientSecret = Math.random().toString(36).substr(2)
    const state = Math.random().toString(36).substr(2)

    // The client ID is the secret's hex hash
    const encoder = new TextEncoder()
    const clientSecretData = encoder.encode(clientSecret)
    const clientIDBuffer = await crypto.subtle.digest('SHA-256', clientSecretData)
    const clientIDArray = Array.from(new Uint8Array(clientIDBuffer))
    const clientID = clientIDArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Store the client secret as a session variable
    window.sessionStorage.setItem('graffitiClientSecret', clientSecret)
    window.sessionStorage.setItem('graffitiClientID', clientID)
    window.sessionStorage.setItem('graffitiAuthState', state)

    // Open the login window
    const authURL = new URL('auth', this.origin)
    authURL.searchParams.set('client_id', clientID)
    authURL.searchParams.set('redirect_uri', window.location.href)
    authURL.searchParams.set('state', state)

    window.location.href = authURL
  }

  authorizationError(reason) {
    alert(`Authorization Error: ${reason}\n\nClick OK to reload.`)
    window.location.reload()
  }

  async codeToToken(code, clientID, clientSecret) {
    // Construct the body of the POST
    let form = new FormData()
    form.append('client_id', clientID)
    form.append('client_secret', clientSecret)
    form.append('code', code)

    // Ask to exchange the code for a token
    const tokenURL = new URL('token', this.origin)
    const response = await fetch(tokenURL, {
        method: 'post',
        body: form
    })

    // Make sure the response is OK
    if (!response.ok) {
      let reason = response.status + ": "
      try {
        reason += (await response.json()).detail
      } catch (e) {
        reason += response.statusText
      }

      return this.authorizationError(`could not exchange code for token.\n\n${reason}`)
    }

    // Parse out the token
    const data = await response.json()
    this.token = data.access_token
    this.myID = data.signature

    // And make sure that the token is valid
    if (!this.token) {
      return this.authorizationError("could not parse token.")
    }

    // Store the token and ID
    window.localStorage.setItem('graffitiToken', this.token)
    window.localStorage.setItem('graffitiID', this.myID)
  }

  logOut() {
    window.localStorage.removeItem('graffitiToken')
    window.localStorage.removeItem('graffitiID')
    window.location.reload()
  }

  async request(method, path, body) {
    // Form basic request
    const requestURL = new URL(path, this.origin)
    const options = {
      method: method,
      body: JSON.stringify(body)
    }

    // If logged in, add authorization
    if (this.loggedIn) {
      options.headers = new Headers({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.token
      })
    }

    // Send the request
    const response = await fetch(requestURL, options)

    // Make sure it went OK
    if (!response.ok) {
      let reason = response.status + ": "
      try {
        reason += (await response.json()).detail
      } catch (e) {
        reason += response.statusText
      }

      throw new Error(reason)
    }

    return await response.json()
  }

}
