export default class Auth {

  constructor(origin) {
    this.origin = origin

    // Check to see if we're redirecting back
    // from an authorization with a code.
    const url = new URL(window.location)
    if (url.searchParams.has('code')) {

      // Get the code and strip it out of the URL
      const code = url.searchParams.get('code')
      url.searchParams.delete('code')
      url.searchParams.delete('state')
      window.history.replaceState({}, '', url)

      // Exchange it for a token
      this.codeToToken(code)

    } else {
      // Initiate authorization
      this.authorize()
    }
  }

  async authorize() {
    // Generate a random client secret
    const clientSecret = Math.random().toString(36).substr(2)

    // The client ID is the secret's hex hash
    const encoder = new TextEncoder()
    const clientSecretData = encoder.encode(clientSecret)
    const clientIDBuffer = await crypto.subtle.digest('SHA-256', clientSecretData)
    const clientIDArray = Array.from(new Uint8Array(clientIDBuffer))
    const clientID = clientIDArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Store the client ID and secret in a cookie
    document.cookie = `clientSecret=${clientSecret}; SameSite=Strict`
    document.cookie = `clientID=${clientID}; SameSite=Strict`

    // Open the login window
    const authURL = new URL('auth', this.origin)
    authURL.searchParams.set('client_id', clientID)
    authURL.searchParams.set('redirect_uri', window.location)
    window.location.replace(authURL)
  }

  getAndDeleteCookie(param) {
    // Decode the cookie string
    const decodedCookies = decodeURIComponent(document.cookie)

    // Delete the cookie if it exists
    document.cookie = param + '=; max-age=0; SameSite=Strict'

    // Find the cookie if it exists
    for (const cookie of decodedCookies.split(';')) {
      // Trim off white-space and parse
      const paramMap = cookie.trim().split(param + '=')
      if (paramMap.length > 1) return paramMap[1]
    }
  }

  authorizationError(reason) {
    alert(`Authorization Error: ${reason}\n\nClick OK to reload.`)
    window.location.reload()
  }

  async codeToToken(code) {
    // Read the stored client cookies
    const clientSecret = this.getAndDeleteCookie('clientSecret')
    const clientID     = this.getAndDeleteCookie('clientID')

    // Make sure they actually exist
    if (!clientSecret || !clientID) {
      return this.authorizationError("missing client secret - are cookies enabled?")
    }

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
    this.token_const = data.access_token
    this.mySignature_const = data.user

    // And make sure that the token is valid
    if (!this.token_const) {
      return this.authorizationError("could not parse token.")
    }

  }

  get token() {
    return (async () => {
      // If the token doesn't already exist wait for it
      while (!this.token_const) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      return this.token_const
    })()
  }

  get mySignature() {
    return (async () => {
      // Make sure we have a token
      await this.token
      return this.mySignature_const
    })()
  }

  async request(method, path, body) {
    // Send the request to the server
    const requestURL = new URL(path, this.origin)
    const response = await fetch(requestURL, {
      method: method,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (await this.token)
      }),
      body: JSON.stringify(body)
    })

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
