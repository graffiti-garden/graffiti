import { randomString, sha256 } from './utils.js'

export default {

  async logIn(graffitiURL) {
    // Generate a random client secret and state
    const clientSecret = randomString()
    const state = randomString()

    // The client ID is the secret's hex hash
    const clientID = await sha256(clientSecret)

    // Store the client secret as a local variable
    window.localStorage.setItem('graffitiClientSecret', clientSecret)
    window.localStorage.setItem('graffitiClientID', clientID)
    window.localStorage.setItem('graffitiAuthState', state)

    // Redirect to the login window
    const loginURL = this.authURL(graffitiURL)
    loginURL.searchParams.set('client_id', clientID)
    loginURL.searchParams.set('redirect_uri', window.location.href)
    loginURL.searchParams.set('state', state)
    window.location.href = loginURL
  },

  async connect(graffitiURL) {

    // Check to see if we are already logged in
    let token = window.localStorage.getItem('graffitiToken')
    let myID  = window.localStorage.getItem('graffitiID')

    if (!token || !myID) {
      // Remove them both in case one exists
      // and the other does not
      token = myID = null

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
        const clientSecret = window.localStorage.getItem('graffitiClientSecret')
        const clientID     = window.localStorage.getItem('graffitiClientID')
        const storedState  = window.localStorage.getItem('graffitiAuthState')
        window.localStorage.removeItem('graffitiClientSecret')
        window.localStorage.removeItem('graffitiClientID')
        window.localStorage.removeItem('graffitiAuthState')

        // Make sure state has been preserved
        if (state != storedState) {
          throw new Error("The state in local storage does not match the state sent by the server")
        }

        // Construct the body of the POST
        let form = new FormData()
        form.append('client_id', clientID)
        form.append('client_secret', clientSecret)
        form.append('code', code)

        // Ask to exchange the code for a token
        const tokenURL = this.authURL(graffitiURL)
        tokenURL.pathname = '/token'
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

          throw new Error(`The authorization code could not be exchanged for a token.\n\n${reason}`)
        }

        // Parse out the token
        const data = await response.json()
        token = data.access_token
        myID = data.owner_id

        // And make sure that the token is valid
        if (!token || !myID) {
          throw new Error(`The authorization token could not be parsed from the response.\n\n${data}`)
        }

        // Store the token and ID
        window.localStorage.setItem('graffitiToken', token)
        window.localStorage.setItem('graffitiID', myID)
      }
    }

    return { myID, token }

  },

  logOut() {
    window.localStorage.removeItem('graffitiToken')
    window.localStorage.removeItem('graffitiID')
    window.location.reload()
  },

  authURL(graffitiURL) {
    const url = new URL(graffitiURL)
    url.host = "auth." + url.host
    return url
  },

}
