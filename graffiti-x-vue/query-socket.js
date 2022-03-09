export default class QuerySocket {

  constructor(origin, auth) {
    this.origin = origin
    this.auth = auth
    this.socket_id_const = null
    this.queries = {}
    this.updateCallbacks = {}
    this.deleteCallbacks = {}
    this.isUnloading = false

    // Close silently
    window.addEventListener(
      "beforeunload",
      (e => {this.isUnloading=true}).bind(this));

    // Open up a WebSocket with the server
    this.connect()
  }

  async connect() {
    const token = await this.auth.token
    const wsURL = new URL('query_socket', this.origin)
    if (wsURL.protocol == 'https:') {
      wsURL.protocol = 'wss:'
    } else {
      wsURL.protocol = 'ws:'
    }
    wsURL.searchParams.set('token', token)
    this.ws = new WebSocket(wsURL)
    this.ws.onmessage = this.onSocketMessage.bind(this)
    this.ws.onclose   = this.onSocketClose  .bind(this)
    this.ws.onerror   = this.onSocketError  .bind(this)
  }

  get socket_id() {
    return (async () => {
      // If the socket ID doesn't already exist, wait for it
      while (!this.socket_id_const) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      return this.socket_id_const
    })()
  }

  async now() {
    await this.socket_id
    return Date.now() - this.localPingTime + this.serverPingTime
  }

  async addQuery(query_id, query, updateCallback, deleteCallback) {
    // Add the query internally
    this.queries[query_id] = query
    this.updateCallbacks[query_id] = updateCallback
    this.deleteCallbacks[query_id] = deleteCallback

    return await this.auth.request(
      'post', 'query_socket_add', {
        socket_id: await this.socket_id,
        query_id: query_id,
        query: query
      }
    )
  }

  async removeQuery(query_id) {
    delete this.queries[query_id]
    delete this.updateCallbacks[query_id]
    delete this.deleteCallbacks[query_id]

    return await this.auth.request(
      'post', 'query_socket_remove', {
        socket_id: await this.socket_id,
        query_id: query_id,
      }
    )
  }

  onSocketMessage(event) {
    const data = JSON.parse(event.data)

    if (data.type == 'Ping') {
      // Sync with the server time
      this.serverPingTime = data.timestamp
      this.localPingTime = Date.now()
      // Store the socket ID
      if (!this.socket_id_const) {
        this.socket_id_const = data.socket_id
        console.log(`Query socket is open with id '${this.socket_id_const}'`)
      }
    } else if (data.type == 'Update') {
      // Call the update callback
      this.updateCallbacks[data.query_id](data)
    } else if (data.type == 'Delete') {
      // Call the delete callback
      this.deleteCallbacks[data.query_id](data.object_id)
    } else if (data.type == 'Reject') {
      throw {
        type: data.type,
        content: 'A query was rejected. ' + data.content,
        query_id: data.query_id,
        query: this.queries[data.query_id],
      }
    } else {
      throw {
        type: 'Error',
        content: `Unrecognized type, '${data.type}'`,
        object: data
      }
    }
  }

  async onSocketClose(event) {
    if (!this.isUnloading) {
      // Forget the socket id
      this.socket_id_const = null

      const shouldReload = confirm("lost connection to the graffiti server.\n\nonce you've established an internet connection, select \"OK\" to reload or select \"Cancel\" to remain on the page and save any data.")
      if (shouldReload) {
        window.location.reload()
      }
    }
  }

  async onSocketError(error) {
    this.ws.close();
  }
}
