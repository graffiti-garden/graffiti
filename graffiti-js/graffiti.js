import Auth from './src/auth.js'
import GraffitiArray from './src/array.js'

export default class {

  // There needs to be a new object map for each tag
  constructor(
    graffitiURL="https://graffiti.garden",
    objectConstructor=()=>({})) {

    this.graffitiURL = graffitiURL
    this.open = false
    this.eventTarget = new EventTarget()
    this.tagMap = objectConstructor() // tag->{count, Set(uuid)}
    this.objectMap = objectConstructor() // uuid->object
    this.GraffitiArray = GraffitiArray(this)

    this.#initialize()
  }

  async #initialize() {
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
    this.#connect()
  }
  
  // Wait for the connection to be
  // open (state=true) or closed (state=false)
  async connectionState(state) {
    if (this.open != state) {
      await new Promise(resolve => {
        this.eventTarget.addEventListener(
          state? "open": "closed", ()=> resolve())
      })
    }
  }

  #connect() {
    this.ws = new WebSocket(this.wsURL)
    this.ws.onmessage = this.#onMessage.bind(this)
    this.ws.onclose   = this.#onClose.bind(this)
    this.ws.onopen    = this.#onOpen.bind(this)
  }

  // authorization functions
  get myID() { return this.authParams.myID }
  toggleLogIn() {
    this.myID? Auth.logOut() : Auth.logIn(this.graffitiURL)
  }

  async #onClose() {
    console.error("lost connection to graffiti server, attemping reconnect soon...")
    this.open = false
    this.eventTarget.dispatchEvent(new Event("closed"))
    await new Promise(resolve => setTimeout(resolve, 2000))
    this.#connect()
  }

  async #request(msg) {
    if (!this.open) {
      throw "Can't make request! Not connected to graffiti server"
    }

    // Create a random message ID
    const messageID = crypto.randomUUID()

    // Create a listener for the reply
    const dataPromise = new Promise(resolve => {
      this.eventTarget.addEventListener('$'+messageID, (e) => {
        resolve(e.data)
      })
    })

    // Send the request
    msg.messageID = messageID
    this.ws.send(JSON.stringify(msg))

    // Await the reply
    const data = await dataPromise
    delete data.messageID

    if ('error' in data) {
      throw data
    } else {
      return data.reply
    }
  }

  #onMessage(event) {
    const data = JSON.parse(event.data)

    if ('messageID' in data) {
      // It's a reply
      // Forward it back to the sender
      const messageEvent = new Event('$'+data.messageID)
      messageEvent.data = data
      this.eventTarget.dispatchEvent(messageEvent)

    } else if ('update' in data) {
      this.#updateCallback(data['update'])

    } else if ('remove' in data) {
      this.#removeCallback(data['remove'])

    } else if (data.type == 'error') {
      if (data.reason == 'authorization') {
        Auth.logOut()
      }
      throw data
    }
  }

  #updateCallback(object) {
    const uuid = this.#objectUUID(object)

    // Add the UUID to the tag map
    let subscribed = false
    for (const tag of object._tags) {
      if (!(tag in this.tagMap)) continue
      this.tagMap[tag].uuids.add(uuid)
      subscribed = true
    }

    if (!subscribed) return

    // Define object specific properties
    if (!('_id' in object)) {
      // Assign the object UUID
      Object.defineProperty(object, '_id', { value: uuid })

      // Add proxy functions so object modifications
      // sync with the server
      object = new Proxy(object, this.#objectHandler(object, true))
    }

    this.objectMap[uuid] = object
  }

  #removeCallback(object) {
    const uuid = this.#objectUUID(object)

    // Remove the UUID from all relevant tag maps
    let supported = false
    for (const tag in this.tagMap) {
      if (this.tagMap[tag].uuids.has(uuid)) {
        if (object._tags.includes(tag)) {
          this.tagMap[tag].uuids.delete(uuid)
        } else {
          supported = true
        }
      }
    }

    // If all tags have been removed, delete entirely
    if (!supported && uuid in this.objectMap) {
      delete this.objectMap[uuid]
    }
  }

  async update(object) {
    object._by = this.myID
    if (!object._key) object._key = crypto.randomUUID()

    // Immediately replace the object
    this.#updateCallback(object)

    // Send it to the server
    try {
      await this.#request({ update: object })
    } catch(e) {
      // Delete the temp object
      this.#removeCallback(object)
      throw e
    }
  }

  #objectHandler(object, root) {
    return {
      get: (target, prop, receiver)=>
        this.#getObjectProperty(object, target, prop, receiver),
      set: (target, prop, val, receiver)=>
        this.#setObjectProperty(object, root, target, prop, val, receiver),
      deleteProperty: (target, prop)=>
        this.#deleteObjectProperty(object, root, target, prop)
    }
  }

  #getObjectProperty(object, target, prop, receiver) {
    if (typeof target[prop] === 'object' && target[prop] !== null) {
      return new Proxy(Reflect.get(target, prop, receiver), this.#objectHandler(object, false))
    } else {
      return Reflect.get(target, prop, receiver)
    }
  }

  #setObjectProperty(object, root, target, prop, val, receiver) {
    // Store the original, perform the update,
    // sync with server and restore original if error
    const originalObject = Object.assign({}, object)
    if (Reflect.set(target, prop, val, receiver)) {
      this.#removeCallback(originalObject)
      this.#updateCallback(object)
      this.#request({ update: object }).catch(e=> {
        this.#removeCallback(object)
        this.#updateCallback(originalObject)
        throw e
      })
      return true
    } else { return false }
  }

  #deleteObjectProperty(object, root, target, prop) {
    const originalObject = Object.assign({}, object)
    if (root && ['_key', '_by', '_tags'].includes(prop)) {
      // This is a deletion of the whole object
      this.#removeCallback(object)
      this.#request({ remove: object._key }).catch(e=> {
        this.#updateCallback(originalObject)
        throw e
      })
      return true
    } else {
      if (Reflect.deleteProperty(target, prop)) {
        this.#request({ update: object }).catch(e=> {
          this.#updateCallback(originalObject)
          throw e
        })
        return true
      } else { return false }
    }
  }

  async myTags() {
    return await this.#request({ ls: null })
  }

  async objectByKey(userID, objectKey) {
    return await this.#request({ get: {
      _by: userID,
      _key: objectKey
    }})
  }

  objects(...tags) {
    tags = tags.filter(tag=> tag!=null)
    for (const tag of tags) {
      if (!(tag in this.tagMap)) {
        throw `You are not subscribed to '${tag}'`
      }
    }

    // Merge by UUIDs from all tags and
    // convert to relevant objects
    const uuids = new Set(tags.map(tag=>[...this.tagMap[tag].uuids]).flat())
    const objects = [...uuids].map(uuid=> this.objectMap[uuid])

    // Return an array wrapped with graffiti functions
    return new this.GraffitiArray(...objects)
  }

  async subscribe(...tags) {
    tags = tags.filter(tag=> tag!=null)
    // Look at what is already subscribed to
    const subscribingTags = []
    for (const tag of tags) {
      if (tag in this.tagMap) {
        // Increase the count
        this.tagMap[tag].count++
      } else {
        // Create a new slot
        this.tagMap[tag] = {
          uuids: new Set(),
          count: 1
        }
        subscribingTags.push(tag)
      }
    }

    // Try subscribing in the background
    // but don't raise an error since
    // the subscriptions will happen once connected
    if (subscribingTags.length)
      try {
        await this.#request({ subscribe: subscribingTags })
      } catch {}
  }

  async unsubscribe(...tags) {
    tags = tags.filter(tag=> tag!=null)
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
      try {
        await this.#request({ unsubscribe: unsubscribingTags })
      } catch {}
  }

  async #onOpen() {
    console.log("connected to the graffiti socket")
    this.open = true
    this.eventTarget.dispatchEvent(new Event("open"))

    // Clear data
    for (let tag in this.tagMap) {
      this.tagMap[tag].uuids = new Set()
    }
    for (let uuid in this.objectMap) delete this.objectMap[uuid]

    // Resubscribe
    const tags = Object.keys(this.tagMap)
    if (tags.length) await this.#request({ subscribe: tags })
  }

  // Utility function to get a universally unique string
  // that represents a particular object
  #objectUUID(object) {
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
