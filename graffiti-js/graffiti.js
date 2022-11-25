import Auth from './auth.js'

export default class {

  constructor(graffitiURL="https://graffiti.garden") {
    this.graffitiURL = graffitiURL
    this.open = false
    this.subscriptionData = {}
    this.eventTarget = new EventTarget()
  }

  // CALL THIS BEFORE DOING ANYTHING ELSE
  async initialize() {
    // Perform authorization
    this.authParams = await Auth.connect(this.graffitiURL)

    // Rewrite the URL
    this.wsURL = new URL(this.graffitiURL)
    this.wsURL.host = "app." + this.wsURL.host
    if (this.wsURL.protocol == 'https:') {
      this.wsURL.protocol = 'wss:'
    } else {
      this.wsURL.protocol = 'ws:'
    }
    if (this.authParams.token) {
      this.wsURL.searchParams.set("token", this.authParams.token)
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

  // authorization functions
  get myID() { return this.authParams.myID }
  toggleLogIn() {
    this.myID? Auth.logOut() : Auth.logIn(this.graffitiURL)
  }

  async onClose() {
    this.open = false
    console.error("lost connection to graffiti server, attemping reconnect soon...")
    await new Promise(resolve => setTimeout(resolve, 2000))
    this.connect()
  }

  async request(msg) {
    // Create a random message ID
    const messageID = crypto.randomUUID()

    // Create a listener for the reply
    const dataPromise = new Promise(resolve => {
      this.eventTarget.addEventListener(messageID, (e) => {
        resolve(e.data)
      })
    })

    // Wait for the socket to open
    if (!this.open) {
      await new Promise(resolve => {
        this.eventTarget.addEventListener("graffitiOpen", () => resolve() )
      })
    }

    // Send the request
    msg.messageID = messageID
    this.ws.send(JSON.stringify(msg))

    // Await the reply
    const data = await dataPromise
    delete data.messageID

    if (data.type == 'error') {
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
      this.eventTarget.dispatchEvent(messageEvent)

    } else if (['updates', 'removes'].includes(data.type)) {
      // Subscription data
      if (data.queryID in this.subscriptionData) {
        const sd = this.subscriptionData[data.queryID]

        // For each data point, either add or remove it
        for (const r of data.results) {
          if (data.type == 'updates') {
            sd.updateCallback(r)
          } else {
            sd.removeCallback(r)
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
    } else if (data.type == 'error') {
      if (data.reason == 'authorization') {
        Auth.logOut()
      }
      throw data
    }
  }

  async update(object, query) {
    const data = await this.request({ object, query })
    return data.objectID
  }

  async remove(objectID) {
    await this.request({ objectID })
  }

  async subscribe(
    query,
    updateCallback,
    removeCallback,
    flags={},
    since=null,
    queryID=null) {

    // Create a random query ID
    if (!queryID) queryID = crypto.randomUUID()

    // Send the request
    await this.request({ queryID, query, since, ...flags })

    // Store the subscription in case of disconnections
    this.subscriptionData[queryID] = {
      query, since, flags, updateCallback, removeCallback,
      historyComplete: false
    }

    return queryID
  }

  async unsubscribe(queryID) {
    // Remove allocated space
    delete this.subscriptionData[queryID]

    // And unsubscribe
    const data = await this.request({ queryID })
  }

  async onOpen() {
    console.log("connected to the graffiti socket")
    this.open = true
    this.eventTarget.dispatchEvent(new Event("graffitiOpen"))
    // Resubscribe to hanging queries
    for (const queryID in this.subscriptionData) {
      const sd = this.subscriptionData[queryID]
      await this.subscribe(
        sd.query,
        sd.updateCallback,
        sd.removeCallback,
        sd.flags,
        sd.since,
        queryID)
    }
  }

  // Adds required fields to an object.
  // You should probably call this before 'update'
  completeObject(object) {
    // Add by/to fields
    object._by = this.myID
    if ('_to' in object && !Array.isArray(object._to)) {
      throw new Error("_to must be an array")
    }

    // Add an open context if none is declared
    if (!object._inContextIf) {
      object._inContextIf = [{}]
    }

    // Pre-generate the object's ID if it does not already exist
    if (!object._id) object._id = crypto.randomUUID()
  }

  // Utility function to get a universally unique string
  // that represents a particular object
  objectUUID(object) {
    if (!object._id || !object._by) {
      throw {
        type: 'error',
        content: 'the object you are trying to identify does not have an ID or owner',
        object
      }
    }
    return object._id + object._by
  }

}
