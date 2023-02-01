import Auth from './auth.js'

export default class {

  // There needs to be a new object map for each tag
  constructor(
    graffitiURL="https://graffiti.garden",
    objectMapConstructor=()=>({})) {

    this.graffitiURL = graffitiURL
    this.objectMapConstructor = objectMapConstructor
    this.open = false
    this.eventTarget = new EventTarget()
    this.tagMap = {}
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

    // Commence connection
    this.connect()

    // Wait until open
    await new Promise(resolve => {
      this.eventTarget.addEventListener("graffitiOpen", () => resolve() )
    })
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
    if (!this.open) {
      throw { 'error': 'Not connected!' }
    }

    // Create a random message ID
    const messageID = crypto.randomUUID()

    // Create a listener for the reply
    const dataPromise = new Promise(resolve => {
      this.eventTarget.addEventListener(messageID, (e) => {
        resolve(e.data)
      })
    })

    // Send the request
    msg.messageID = messageID
    this.ws.send(JSON.stringify(msg))

    // Await the reply
    const data = await dataPromise
    delete data.messageID

    if (data.type == 'error') {
      throw data
    } else {
      return data['reply']
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

    } else if ('update' in data || 'remove' in data) {

      const object = 'update' in data? data['update'] : data['remove']
      const uuid = this.objectUUID(object)

      for (const tag of object._tags) {
        if (tag in this.tagMap) {
          const om = this.tagMap[tag].objectMap

          if ('remove' in data) {
            delete om[uuid]
          } else {
            om[uuid] = object
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

  async update(object) {
    // TODO
    // Add the logic in vue to here
    return await this.request({ update: object })
  }

  async remove(objectKey) {
    // TODO
    // same
    return await this.request({ remove: objectKey })
  }

  async lsTags() {
    return await this.request({ ls: null })
  }

  async objectByKey(userID, objectKey) {
    return await this.request({ get: {
      _by: userID,
      _key: objectKey
    }})
  }

  objectsByTags(...tags) {
    for (const tag of tags) {
      if (!(tag in this.tagMap)) {
        throw `You are not subscribed to '${tag}'`
      }
    }

    // Merge by UUID to combine all the maps
    const combinedMaps = Object.assign({},
      ...tags.map(tag=> this.tagMap[tag].objectMap))

    // Return just the array
    return Object.values(combinedMaps)
  }

  async subscribe(...tags) {
    // Look at what is already subscribed to
    const subscribingTags = []
    for (const tag of tags) {
      if (tag in this.tagMap) {
        // Increase the count
        this.tagMap[tag].count++
      } else {
        // Create a new slot
        this.tagMap[tag] = {
          objectMap: this.objectMapConstructor(),
          count: 1
        }
        subscribingTags.push(tag)
      }
    }

    // Begin subscribing in the background
    if (subscribingTags.length)
      await this.request({ subscribe: subscribingTags })
  }

  async unsubscribe(...tags) {
    // Decrease the count of each tag,
    // removing and marking if necessary
    const unsubscribingTags = []
    for (const tag of tags) {
      this.tagMap[tag].count--

      if (!this.tagMap[tag].count) {
        unsubscribingTags.push(tag)
        delete this.tagMap[tag]
      }
    }

    // Unsubscribe from all remaining tags
    if (unsubscribingTags.length)
      await this.request({ unsubscribe: unsubscribingTags })
  }

  async onOpen() {
    console.log("connected to the graffiti socket")
    this.open = true
    this.eventTarget.dispatchEvent(new Event("graffitiOpen"))

    // Clear data
    for (let tag in this.tagMap) {
      const objectMap = this.tagMap[tag].objectMap
      for (let uuid in objectMap) delete objectMap[uuid]
    }

    // Resubscribe
    const tags = Object.keys(this.tagMap)
    if (tags.length) await this.request({ subscribe: tags })
  }

  // Adds required fields to an object.
  // You should probably call this before 'update'
  completeObject(object) {
    // Add by/to fields
    object._by = this.myID
    if ('_to' in object && !Array.isArray(object._to)) {
      throw new Error("_to must be an array")
    }

    // Pre-generate the object's ID if it does not already exist
    if (!object._key) object._key = crypto.randomUUID()

    return object
  }

  // Utility function to get a universally unique string
  // that represents a particular object
  objectUUID(object) {
    if (!object._by || !object._key) {
      throw {
        type: 'error',
        content: 'the object you are trying to identify does not have an owner or key',
        object
      }
    }
    return object._by + object._key
  }
}
