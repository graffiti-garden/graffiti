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
      // Check to see if we have cookies
      this.token = this.getCookie('token')
      this.mySignature = this.getCookie('mySignature')

      // Otherwise initiate authorization
      if (!this.token || !this.mySignature) {
        this.authorize()
      }
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
    this.storeCookie('clientSecret', clientSecret)
    this.storeCookie('clientID', clientID)

    // Open the login window
    const authURL = new URL('auth', this.origin)
    authURL.searchParams.set('client_id', clientID)
    authURL.searchParams.set('redirect_uri', window.location)
    window.location.replace(authURL)
  }

  storeCookie(param, data) {
    document.cookie = `${param}=${data}; path=/; SameSite=Strict`
  }

  getCookie(param) {
    // Decode the cookie string
    const decodedCookies = decodeURIComponent(document.cookie)

    // Find the cookie if it exists
    for (const cookie of decodedCookies.split(';')) {
      // Trim off white-space and parse
      const paramMap = cookie.trim().split(param + '=')
      if (paramMap.length > 1) return paramMap[1]
    }
  }

  deleteCookie(param) {
    // Delete the cookie if it exists
    document.cookie = param + '=; max-age=0; path=/; SameSite=Strict'
  }

  authorizationError(reason) {
    alert(`Authorization Error: ${reason}\n\nClick OK to reload.`)
    window.location.reload()
  }

  async codeToToken(code) {
    // Read the stored client cookies
    const clientSecret = this.getCookie('clientSecret')
    const clientID     = this.getCookie('clientID')
    this.deleteCookie(clientSecret)
    this.deleteCookie(clientID)

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
    this.token = data.access_token
    this.mySignature = data.signature

    // And make sure that the token is valid
    if (!this.token) {
      return this.authorizationError("could not parse token.")
    }

    // Store the token and signature in cookies
    this.storeCookie('token', this.token)
    this.storeCookie('mySignature', this.mySignature)
  }

  logOut() {
    this.deleteCookie('token')
    this.deleteCookie('mySignature')
  }

  async isInitialized() {
    while (!this.token) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  get mySignature() {
    if (!this.mySignatureValue) {
      throw {
        type: 'Error',
        content: 'Authorization has not yet completed. await isInitialized() before calling mySignature'
      }
    }
    return this.mySignatureValue
  }

  set mySignature(val) {
    this.mySignatureValue = val
  }

  async request(method, path, body) {
    // Make sure we have a token
    await this.isInitialized()

    // Send the request to the server
    const requestURL = new URL(path, this.origin)
    const response = await fetch(requestURL, {
      method: method,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.token
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
