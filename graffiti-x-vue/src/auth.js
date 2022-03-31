export default class Auth {

  constructor(origin) {
    this.origin = origin

    // Check to see if we have cookies
    this.token = this.getCookie('token')
    this.mySignature = this.getCookie('mySignature')
  }

  get loggedIn() {
    return this.token && this.mySignature
  }

  async logIn() {
    if (this.loggedIn) return true

    // Reset the error flag
    this.error = false

    // Generate a random client secret
    const clientSecret = Math.random().toString(36).substr(2)

    // The client ID is the secret's hex hash
    const encoder = new TextEncoder()
    const clientSecretData = encoder.encode(clientSecret)
    const clientIDBuffer = await crypto.subtle.digest('SHA-256', clientSecretData)
    const clientIDArray = Array.from(new Uint8Array(clientIDBuffer))
    const clientID = clientIDArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Establish bidirectional communication with the server
    const wsURL = new URL('auth_socket', this.origin)
    if (wsURL.protocol == 'https:') {
      wsURL.protocol = 'wss:'
    } else {
      wsURL.protocol = 'ws:'
    }
    wsURL.searchParams.set('client_id', clientID)
    let ws = new WebSocket(wsURL)

    // When we connect, open an authorization window
    ws.onopen = () => {
      // Open the login window
      const authURL = new URL('auth', this.origin)
      authURL.searchParams.set('client_id', clientID)

      // Our redirect URI should send a message back to the socket
      const redirectURL = new URL('auth_socket_send', this.origin)
      redirectURL.searchParams.set('client_id', clientID)
      authURL.searchParams.set('redirect_uri', redirectURL)

      window.open(authURL)
    }

    // When we receive a code, convert it to a token
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type == 'Accept') {
        this.codeToToken(data.code, clientID, clientSecret)
      }
    }

    ws.onerror = () => {
      return this.authorizationError("lost connection to the graffiti server")
    }

    // Wait until we have logged in
    while (!this.error && !this.token) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    ws.close()

    return !this.error
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
    this.error = true
    alert(`Authorization Error: ${reason}\n\n`)
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
    this.token = null
    this.mySignature = null
  }

  get mySignature() {
    if (!this.mySignatureValue) {
      throw {
        type: 'Error',
        content: 'Not logged in'
      }
    }
    return this.mySignatureValue
  }

  set mySignature(val) {
    this.mySignatureValue = val
  }

  async request(method, path, body) {
    // if not logged in
    if (!this.loggedIn) {
      throw {
        type: 'Error',
        content: 'Not logged in'
      }
    }

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
