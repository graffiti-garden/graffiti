import { randomString, sha256 } from './utils.js'

export default class GraffitiAuth {

  constructor(origin) {
    this.origin = new URL(origin)
    this.origin.host = "auth." + this.origin.host
    this.initialized = false
    this.initialize()
  }

  authorizationError(reason) {
    alert(`Authorization Error: ${reason}\n\nClick OK to reload.`)
    window.location.reload()
  }

  async initialize() {
    // Check to see if we are already logged in
    this.tokenValue = window.localStorage.getItem('graffitiToken')
    this.myIDValue  = window.localStorage.getItem('graffitiID')

    if (!this.tokenValue || !this.myIDValue) {
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

        await this.codeToToken(code, clientID, clientSecret)
      }
    }

    this.initialized = true
    document.dispatchEvent(new Event("graffitiInitialized"))
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
    this.tokenValue = data.access_token
    this.myIDValue = data.owner_id

    // And make sure that the token is valid
    if (!this.tokenValue) {
      return this.authorizationError("could not parse token.")
    }

    // Store the token and ID
    window.localStorage.setItem('graffitiToken', this.tokenValue)
    window.localStorage.setItem('graffitiID', this.myIDValue)
  }

  async loggedIn() {
    if (!this.initialized) {
      await new Promise(resolve => {
        document.addEventListener("graffitiInitialized", () => resolve() )
      })
    }
    return (this.tokenValue != null) && (this.myIDValue != null)
  }

  async myID() {
    await this.loggedIn()
    return this.myIDValue
  }

  async token() {
    await this.loggedIn()
    return this.tokenValue
  }

  async logIn() {
    if (await this.loggedIn()) return

    // Generate a random client secret and state
    const clientSecret = randomString()
    const state = randomString()

    // The client ID is the secret's hex hash
    const clientID = await sha256(clientSecret)

    // Store the client secret as a session variable
    window.sessionStorage.setItem('graffitiClientSecret', clientSecret)
    window.sessionStorage.setItem('graffitiClientID', clientID)
    window.sessionStorage.setItem('graffitiAuthState', state)

    // Redirect to the login window
    const authURL = new URL(this.origin)
    authURL.searchParams.set('client_id', clientID)
    authURL.searchParams.set('redirect_uri', window.location.href)
    authURL.searchParams.set('state', state)
    window.location.href = authURL
  }

  logOut() {
    window.localStorage.removeItem('graffitiToken')
    window.localStorage.removeItem('graffitiID')
    window.location.reload()
  }

}
