import Ajv from "https://cdn.jsdelivr.net/npm/ajv@8.12.0/+esm"
import Auth from './src/auth.js'
import GraffitiArray from './src/array.js'
import { globalSchema, processLocalSchema, processUpdate } from './src/schema.js'

export default class {

  constructor(options={}) {
    options = {
      url: "https://graffiti.garden",
      objectConstructor: ()=>({}),
      globalSchema, processLocalSchema, processUpdate,
      ...options
    }

    this.url = options.url
    this.open = false
    this.eventTarget = new EventTarget()
    this.tagMap = options.objectConstructor() // tag->{count, Set(id)}
    this.objectMap = options.objectConstructor() // uuid->object
    this.GraffitiArray = GraffitiArray(this)
    this.ajv = new Ajv()
    this.globalSchemaValidator = this.ajv.compile(globalSchema)
    this.processLocalSchema = processLocalSchema
    this.processUpdate = processUpdate

    this.#initialize()
  }

  async #initialize() {
    // Perform authorization
    this.authParams = await Auth.connect(this.url)

    // Rewrite the URL
    this.wsURL = new URL(this.url)
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
  get myActor() { return this.authParams.myActor }
  toggleLogIn() {
    this.myActor? Auth.logOut() : Auth.logIn(this.url)
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
    // Add the ID to the tag map
    let subscribed = false
    for (const tag of object.tag) {
      if (!(tag in this.tagMap)) continue
      this.tagMap[tag].ids.add(object.id)
      subscribed = true
    }

    if (!subscribed) return

    // Add proxy functions so object modifications
    // sync with the server
    if (!('__graffitiProxy' in object)) {
      Object.defineProperty(object, '__graffitiProxy', { value: true })
      object = new Proxy(object, this.#objectHandler(object, true))
    }

    this.objectMap[object.id] = object
  }

  #removeCallback(object) {
    // Remove the ID from all relevant tag maps
    let supported = false
    for (const tag in this.tagMap) {
      if (this.tagMap[tag].ids.has(object.id)) {
        if (object.tag.includes(tag)) {
          this.tagMap[tag].ids.delete(object.id)
        } else {
          supported = true
        }
      }
    }

    // If all tags have been removed, delete entirely
    if (!supported && object.id in this.objectMap) {
      delete this.objectMap[object.id]
    }
  }

  async update(object) {
    object.actor = this.myActor
    if (!object.id) object.id =
      `graffitiobject://${this.myActor.substring(16)}:${crypto.randomUUID()}`

    // Pre-process
    this.processUpdate(object)

    // Make sure it adheres to the spec
    if (!this.globalSchemaValidator(object)) {
      throw this.globalSchemaValidator.errors
    }

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
    if (root && ['id', 'actor', 'tag'].includes(prop)) {
      // This is a deletion of the whole object
      this.#removeCallback(object)
      this.#request({ remove: object.id }).catch(e=> {
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

  async objectByID(objectID) {
    return await this.#request({get: objectID})
  }

  objects(tags, schema={}) {
    tags = tags.filter(tag=> tag!=null)
    for (const tag of tags) {
      if (!(tag in this.tagMap)) {
        throw `You are not subscribed to '${tag}'`
      }
    }

    // Compile the new schema
    schema.type = "object"
    schema.required = 'required' in schema?schema.required:[]
    schema.properties = 'properties' in schema?schema.properties:{}
    this.processLocalSchema(schema)
    const localSchemaValidator = this.ajv.compile(schema)

    // Merge by IDs from all tags and
    // convert to relevant objects
    const ids = new Set(tags.map(tag=>[...this.tagMap[tag].ids]).flat())
    const objects = [...ids]
      .map(id=> this.objectMap[id])
      .filter(o=> this.globalSchemaValidator(o) &&
                        localSchemaValidator(o))

    // Return an array wrapped with graffiti functions
    return new this.GraffitiArray(...objects)
  }

  async subscribe(tags) {
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
          ids: new Set(),
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

  async unsubscribe(tags) {
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
      this.tagMap[tag].ids = new Set()
    }
    for (let id in this.objectMap) delete this.objectMap[id]

    // Resubscribe
    const tags = Object.keys(this.tagMap)
    if (tags.length) await this.#request({ subscribe: tags })
  }
}
