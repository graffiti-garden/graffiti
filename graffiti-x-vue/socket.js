import { randomString } from './utils.js'

export default class GraffitiSocket {

  constructor(origin, token) {
    this.open = false
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

    // And commence connection
    this.connect()
  }

  connect() {
    this.ws = new WebSocket(this.wsURL)
    this.ws.onmessage = this.onMessage.bind(this)
    this.ws.onclose   = this.onClose.bind(this)
    this.ws.onopen    = this.onOpen.bind(this)
  }

  async onClose() {
    this.open = false
    console.error("lost connection to graffiti server, attemping reconnect soon...")
    await new Promise(resolve => setTimeout(resolve, 2000))
    this.connect()
  }

  async request(msg) {
    // Create a random message ID
    const messageID = randomString()

    // Create a listener for the reply
    const dataPromise = new Promise(resolve => {
      document.addEventListener(messageID, (e) => {
        resolve(e.data)
      })
    })

    // Wait for the socket to open
    if (!this.open) {
      await new Promise(resolve => {
        document.addEventListener("graffitiOpen", () => resolve() )
      })
    }

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

    } else if (['updates', 'deletes'].includes(data.type)) {
      // Subscription data
      if (data.queryID in this.subscriptionData) {
        const sd = this.subscriptionData[data.queryID]

        // For each data point, either add or remove it
        if (data.type == 'updates') {
          for (const r of data.results) {
            sd.output[r._id] = r
          }
        } else {
          for (const id of data.results) {
            if (id in sd.output) {
              delete sd.output[id]
            }
          }
        }

        // And update this query's notion of "now"
        if (data.complete) {
          if (data.historical) {
            sd.historyComplete = true
          }
          if (sd.historyComplete) {
            sd.since = data.now
          }
        }
      }
    }
  }

  async update(object, idProof) {
    const data = await this.request({
      type: "update",
      object, idProof
    })
    return data.objectID
  }

  async delete(objectID) {
    await this.request({
      type: "delete",
      objectID
    })
  }

  async subscribe(query, output, since=null, queryID=null) {
    // Create a random query ID
    if (!queryID) queryID = randomString()

    // Send the request
    await this.request({
      type: "subscribe",
      queryID, query, since
    })

    // Store the subscription in case of disconnections
    this.subscriptionData[queryID] = {
      query, since, output,
      historyComplete: false
    }

    return queryID
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

  async onOpen() {
    console.log("connected to the graffiti socket")
    this.open = true
    document.dispatchEvent(new Event("graffitiOpen"))
    // Resubscribe to hanging queries
    for (const queryID in this.subscriptionData) {
      const sd = this.subscriptionData[queryID]
      await this.subscribe(sd.query, sd.output, sd.since, queryID)
    }
  }
}
