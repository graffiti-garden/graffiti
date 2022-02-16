export default class Query {

  constructor(origin, auth) {
    // Initialize
    this.origin = origin
    this.auth = auth
    this.connected = false
    this.queries = {}
    this.callbacks = {}
    this.timestamps = {}
    this.query_queue = []

    // Open up a WebSocket with the server
    this.connect()
  }

  async connect() {
    const token = await this.auth.token
    const wsURL = new URL('query', this.origin)
    if (wsURL.protocol == 'https:') {
      wsURL.protocol = 'wss:'
    } else {
      wsURL.protocol = 'ws:'
    }
    wsURL.searchParams.set('token', token)
    this.ws = new WebSocket(wsURL)
    this.ws.onopen    = this.onSocketOpen   .bind(this)
    this.ws.onmessage = this.onSocketMessage.bind(this)
    this.ws.onclose   = this.onSocketClose  .bind(this)
    this.ws.onerror   = this.onSocketError  .bind(this)
  }

  async addQuery(query_id, query, callback) {
    // Add the query to internal storage
    this.queries[query_id] = query
    this.callbacks[query_id] = callback
    this.timestamps[query_id] = null

    // Push the update to the server
    this.query_queue.push({
      type: 'Add',
      query_id: query_id,
      query: query,
    })
    await this.updateQueries()
  }

  async removeQuery(query_id) {
    if (!(query_id in this.queries)) {
      throw {
        type: 'Error',
        content: `query_id, ${query_id} does not exist!`
      }
    }

    // Remove the query from internal storage
    delete this.queries[query_id]
    delete this.callbacks[query_id]
    delete this.timestamps[query_id]

    // Push the update to the server
    this.query_queue.push({
      type: 'Remove',
      query_id: query_id
    })
    await this.updateQueries()
  }

  async updateQueries() {
    if (this.connected) {
      // Send all of the updates waiting in the queue
      while (this.query_queue.length > 0) {
        await this.ws.send(
          JSON.stringify(
            this.query_queue.pop()
          )
        )
      }
    }
  }

  async onSocketOpen(event) {
    console.log('Query socket is open.')
    this.connected = true
    this.updateQueries()
  }

  async onSocketMessage(event) {
    const data = JSON.parse(event.data)

    if (data.type == 'Update') {
      // Update the timestamp of the latest message
      this.timestamps[data.query_id] = data.timestamp
      // And call the callback
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
    } else if (data.type == 'Accept') {
      // nothing to do
    } else if (data.type == 'Ping') {
      // nothing to do
    } else {
      throw {
        type: 'Error',
        content: `Unrecognized type, '${data.type}'`,
        object: data
      }
    }
  }

  async onSocketClose(event) {
    this.connected = false

    // Reset the queue too add all
    // of the existing queries
    this.query_queue = []
    for (let query_id in this.queries) {
      this.query_queue.push({
        type: 'Add',
        query_id: query_id,
        query: this.queries[query_id],
        timestamp: this.timestamps[query_id]
      })
    }

    console.log('Query socket is closed. Will attempt to reconnect in 5 seconds...')
    setTimeout(this.connect.bind(this), 5000)
  }

  async onSocketError(error) {
    this.ws.close();
  }
}
