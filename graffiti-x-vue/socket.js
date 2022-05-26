export default class GraffitiSocket {

  constructor(origin, token) {
    this.subscriptionData = {}

    // Rewrite the URL
    this.wsURL = new URL(origin)
    this.wsURL.host = "app." + this.wsURL.host
    if (this.wsURL.protocol == 'https:') {
      this.wsURL.protocol = 'wss:'
    } else {
      this.wsURL.protocol = 'ws:'
    }
    if (token) {
      this.wsURL.searchParams.set("token", token)
    }

    this.connect()
  }

  async connect() {
    while (true) {
      try {
        this.ws = new WebSocket(this.wsURL)
        this.ws.onmessage = this.onSocketMessage.bind(this)
        this.ws.onerror   = this.connect.bind(this)
        this.ws.onclose   = this.connect.bind(this)
        this.ws.onconnect = this.onConnect.bind(this)
      } catch {
        console.log("lost connection to graffiti server, attemping reconnect soon...")
        // If it didn't work, sleep and try again
        await Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  async request(msg) {
    // Create a random message ID
    const messageID = Math.random().toString(36).substr(2)

    // Create a listener for the reply
    const dataPromise = new Promise(resolve => {
      document.addEventListener(messageID, (e) => {
        resolve(e.data)
      })
    })

    // Send the request
    msg.messageID = messageID
    this.ws.send(JSON.stringify(msg))

    // Await the reply
    const data = await dataPromise
    delete data.messageID

    if (data.type == 'error' ) {
      throw data
    } else {
      return data
    }
  }

  onMessage(event) {
    const data = JSON.parse(event.data)

    if ('messageID' in data) {
      // It's a reply
      // Forward it back to the sender
      const messageEvent = new Event(data.messageID)
      messageEvent.data = data
      document.dispatchEvent(messageEvent)

    } else if (data.type in ['updates', 'deletes']) {
      // Subscription data
      if (data.queryID in this.subscriptionData) {
        const sd = this.subscriptionData[data.queryID]

        // For each data point, either add or remove it
        for (r in data.results) {
          if (data.type == 'updates') {
            sd.output[r._id] = r
          } else {
            delete sd.output[r]
          }
        }

        // And update this queries notion of "now"
        if (data.complete) {
          if (data.historical) {
            sd.historyComplete = true
          }
          if (d.historyComplete) {
            sd.since = data.now
          }
        }
      }
    }
  }

  async update(object) {
    const data = await this.request({
      type: "update",
      object
    })

    return data.objectID
  }

  async delete(objectID) {
    await this.request({
      type: "delete",
      objectID
    })
  }

  async subscribe(query, since, output, queryID=null, historyComplete=false) {
    // Create a random query ID
    if (!queryID) {
      queryID = Math.random().toString(36).substr(2)
    }

    // Store the subscription in case of disconnections
    this.subscriptionData[queryID] = {
      query, since, output, historyComplete
    }
    try {
      const data = await this.request({
        type: "subscribe",
        queryID, query, since
      })
    } catch(e) {
      // Clean up and re-throw
      delete this.subscriptionData[queryID]
      throw  e
    }
  }

  async unsubscribe(queryID) {
    // Remove allocated space
    delete this.subscriptionData[queryID]

    // And unsubscribe
    const data = await this.request({
      type: "unsubscribe",
      queryID
    })
  }

  async onConnect() {
    // Resubscribe to hanging queries
    for (queryID in this.subscriptionData) {
      const sd = this.subscriptionData[queryID]
      await this.subscribe(sd.query, sd.since, sd.output, queryID, sd.historyComplete)
    }
  }
}
