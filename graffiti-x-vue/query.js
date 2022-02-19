export default class Query {

  constructor(origin, auth) {
    // Initialize
    this.origin = origin
    this.auth = auth
    this.socket_id = null
    this.queries = {}
    this.callbacks = {}
    this.add_queue = {}
    this.remove_queue = []

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

  async addQuery(query_id, query, callback) {
    // Add the query internally
    this.queries[query_id] = query
    this.callbacks[query_id] = callback

    // Push the update to the server
    this.add_queue[query_id] = query
    await this.updateQueries()
  }

  async removeQuery(query_id) {
    // Remove the query from anywhere it could be
    if (query_id in this.queries) {
      delete this.queries[query_id]
      delete this.callbacks[query_id]
    }
    if (query_id in this.add_queue) {
      delete this.add_queue[query_id]
    }

    // Push the update to the server
    this.remove_queue.push(query_id)
    await this.updateQueries()
  }

  async updateQueries() {
    if (this.socket_id != null) {
      // Send all of the updates waiting in the queue
      if (Object.keys(this.add_queue)) {
        let add_time = await this.auth.request(
          'post', 'query_socket_add', {
          socket_id: this.socket_id,
          queries: this.add_queue
        })
      }
      if (this.remove_queue.length) {
        let remove_time = await this.auth.request(
          'post', 'query_socket_remove', {
          socket_id: this.socket_id,
          query_ids: this.remove_queue
        })
      }
    }
  }

  async onSocketMessage(event) {
    const data = JSON.parse(event.data)

    if (data.type == 'Ping') {
      // Store the socket ID
      if (this.socket_id == null) {
        this.socket_id = data.socket_id
        console.log(`Query socket is open with id '${this.socket_id}'`)
        this.updateQueries()
      }
    } else if (data.type == 'Update') {
      // Call the callback
      await this.callbacks[data.query_id](
        data.object,
        data.near_misses,
        data.accept
      )
    } else if (data.type == 'Reject') {
      throw {
        type: 'Error',
        content: 'A query update was rejected',
        object: data
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
    // Forget the socket id
    this.socket_id = null

    // Reset the queue too add all
    // of the existing queries
    for (let query_id in this.queries) {
      if (!(query_id in this.add_queue)) {
        this.add_queue[query_id] = this.queries[query_id]
      }
    }

    console.log('Query socket is closed. Will attempt to reconnect in 5 seconds...')
    setTimeout(this.connect.bind(this), 5000)
  }

  async onSocketError(error) {
    this.ws.close();
  }
}
