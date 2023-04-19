import Auth from './src/auth.js'
import GraffitiArray from './src/array.js'
import TorrentMedia from './src/torrent-media.js'

export default class {

  constructor(options={}) {
    options = {
      url: "https://graffiti.garden",
      ...options
    }

    this.url = options.url
    this.open = false
    this.events = new EventTarget()
    this.eventTarget = new EventTarget()
    this.contextMap = {} // context->{Set(queryID), Set(id)}
    this.objectMap = {} // uuid->object
    this.GraffitiArray = GraffitiArray(
      ()=>this.me,
      this.post.bind(this),
      this.remove.bind(this))
    this.media = new TorrentMedia()

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

  #connect() {
    this.ws = new WebSocket(this.wsURL)
    this.ws.onmessage = this.#onMessage.bind(this)
    this.ws.onclose   = this.#onClose.bind(this)
    this.ws.onopen    = this.#onOpen.bind(this)
  }

  // authorization functions
  get me() { return this.authParams.myActor }
  toggleLogIn() {
    this.me? Auth.logOut() : Auth.logIn(this.url)
  }

  async #onClose() {
    console.error("lost connection to graffiti server, attemping reconnect soon...")
    this.open = false
    this.events.dispatchEvent(new Event("disconnected"))
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
      this.eventTarget.addEventListener(
        '$' + messageID,
        e=> resolve(e.data),
        { once: true, passive: true }
      )
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

    } else if ('error' in data) {
      if (data.error == 'authorization') {
        Auth.logOut()
      }
      throw data
    }
  }

  #updateCallback(object) {
    // Add the ID to the context map
    let subscribedContexts = []
    for (const context of [...object.context, object.id]) {
      if (!(context in this.contextMap)) continue
      this.contextMap[context].ids.add(object.id)
      subscribedContexts.push(context)
    }

    // Add proxy functions so object modifications
    // sync with the server
    if (!('__graffitiProxy' in object)) {
      Object.defineProperty(object, '__graffitiProxy', { value: true })
      object = new Proxy(object, this.#objectHandler(object))
    }

    if (subscribedContexts.length) {
      this.objectMap[object.id] = object

      // Send to each listener
      ;[...new Set(subscribedContexts.map(c=>[...this.contextMap[c].queries]).flat())]
        .forEach(queryID=> {
          const objectEvent = new Event('#' + queryID)
          objectEvent.object = object
          this.eventTarget.dispatchEvent(objectEvent)
        })
    }

    return object
  }

  #removeCallback(object) {
    const unsupportedContexts = []
    const supportedContexts   = []
    for (const context in this.contextMap) {
      if (this.contextMap[context].ids.has(object.id)) {
        // TODO: it is ambiguous whether object.id should be deleted...
        if ([...object.context, object.id].includes(context)) {
          this.contextMap[context].ids.delete(object.id)
          unsupportedContexts.push(context)
        } else {
          supportedContexts.push(context)
        }
      }
    }

    // If all contexts have been removed, delete entirely
    if (!supportedContexts.length && object.id in this.objectMap) {
      delete this.objectMap[object.id]
    }

    // These are all the queries that (may) see a delete
    const unsupportedQueries = new Set(unsupportedContexts.map(c=>[...this.contextMap[c].queries]).flat())
    // These queries won't see a delete
    const supportedQueries   = new Set(  supportedContexts.map(c=>[...this.contextMap[c].queries]).flat())
    // Only send messages to the queries with no support at all
    // unsupportedQueries - supportedQueries
    ;[...unsupportedQueries].filter(q=> !supportedQueries.has(q))
      .forEach(queryID=> {
        const objectEvent = new Event('#' + queryID)
        // Strip the object to just it's ID for the event
        objectEvent.object = { id: object.id }
        this.eventTarget.dispatchEvent(objectEvent)
      })
  }

  post(object) {
    object.actor = this.me
    object.id =
      `graffitiobject://${this.me.substring(16)}:${crypto.randomUUID()}`
    object.updated = new Date().toISOString()
    object.published = object.updated
    if (!('context' in object) ||
        !object.context.length) {
      object.context = [this.me]
    }

    // De-dupe contexts
    object.context = [...new Set(object.context)];

    // Immediately replace the object
    object = this.#updateCallback(object)

    // Send it to the server
    this.#request({ update: object }).catch(e=>{
      this.#removeCallback(object)
      throw e
    })

    return object
  }

  remove(...objects) {
    for (const object of objects) {
      const originalObject = Object.assign({}, object)
      this.#removeCallback(object)
      this.#request({ remove: object.id }).catch(e=> {
        this.#updateCallback(originalObject)
        throw e
      })
    }
  }

  #objectHandler(object) {
    return {
      get: (target, prop, receiver)=> {
        if (typeof target[prop] === 'object' && target[prop] !== null) {
          return new Proxy(
            Reflect.get(target, prop, receiver),
            this.#objectHandler(object))
        } else {
          return Reflect.get(target, prop, receiver)
        }
      },
      set: (target, prop, val, receiver)=> {
        // Store the original, perform the update,
        // sync with server and restore original if error
        const originalObject = Object.assign({}, object)
        if (Reflect.set(target, prop, val, receiver)) {
          object.updated = new Date().toISOString()
          this.#removeCallback(originalObject)
          this.#updateCallback(object)
          this.#request({ update: object }).catch(e=> {
            this.#removeCallback(object)
            this.#updateCallback(originalObject)
            throw e
          })
          return true
        } else { return false }
      }, 
      deleteProperty: (target, prop)=> {
        const originalObject = Object.assign({}, object)
        if (Reflect.deleteProperty(target, prop)) {
          this.#request({ update: object }).catch(e=> {
            this.#updateCallback(originalObject)
            throw e
          })
          return true
        } else { return false }
      }
    }
  }

  async myContexts() {
    return await this.#request({ ls: null })
  }

  async *objects(contexts, signal) {
    if (!contexts) contexts = [this.me]
    contexts = contexts.filter(context=> context!=null)

    // Subscribe
    const queryID = crypto.randomUUID()
    this.#subscribe(contexts, queryID)

    // Send existing objects
    const ids = new Set(contexts.map(c=>[...this.contextMap[c].ids]).flat())
    for (const id of ids) {
      yield this.objectMap[id]
    }

    try {
      // Wait for updates
      while (true) {
        yield await new Promise((resolve, reject)=> {
          const retreive = e=> {
            signal?.removeEventListener("abort", abort)
            resolve(e.object)
          }
          const abort = ()=> {
            this.eventTarget.removeEventListener('#' + queryID, retreive)
            reject(this.reason)
          }
          this.eventTarget.addEventListener(
            '#' + queryID,
            retreive,
            { once: true, passive: true }
          )
          signal?.addEventListener(
            "abort",
            abort,
            { once: true, passive: true }
          )
        })
      }
    } catch {} finally {
      this.#unsubscribe(contexts, queryID)
    }
  }

  async #subscribe(contexts, queryID) {
    // Look at what is already subscribed to
    const subscribingContexts = []
    for (const context of contexts) {
      if (context in this.contextMap) {
        // Increase the count
        this.contextMap[context].queries.add(queryID)
      } else {
        // Create a new slot
        this.contextMap[context] = {
          ids: new Set(),
          queries: new Set([queryID])
        }
        subscribingContexts.push(context)
      }
    }

    // Try subscribing in the background
    // but don't raise an error since
    // the subscriptions will happen once connected
    if (subscribingContexts.length)
      try {
        await this.#request({ subscribe: subscribingContexts })
      } catch {}
  }

  async #unsubscribe(contexts, queryID) {
    // Decrease the count of each context,
    // removing and marking if necessary
    const unsubscribingContexts = []
    for (const context of contexts) {
      this.contextMap[context].queries.delete(queryID)
    }

    // Delete completely unsubscribed contexts
    for (const context of contexts) {
      if (!this.contextMap[context].queries.size) {
        unsubscribingContexts.push(context)

        const keys = new Set(Object.keys(this.contextMap))
        for (const id of this.contextMap[context].ids) {
          // Delete objects not attached to any subscription
          const keysLeft = this.objectMap[id].context.reduce(
            (a, c)=> a + (c!=context&&keys.has(c)?1:0), 0)
          if (!keysLeft) { delete this.objectMap[id] }
        }

        delete this.contextMap[context]
      }
    }

    // Unsubscribe from all remaining contexts
    if (unsubscribingContexts.length)
      try {
        await this.#request({ unsubscribe: unsubscribingContexts })
      } catch {}
  }

  async #onOpen() {
    this.open = true

    // Clear data
    for (let context in this.contextMap) {
      this.contextMap[context].ids = new Set()
    }
    for (let id in this.objectMap) delete this.objectMap[id]

    // Resubscribe
    const contexts = Object.keys(this.contextMap)
    if (contexts.length) await this.#request({ subscribe: contexts })

    console.log("connected to the graffiti socket")
    this.events.dispatchEvent(new Event("connected"))
  }
}
