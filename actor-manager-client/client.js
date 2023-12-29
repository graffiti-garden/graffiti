// const defaultOrigin = "https://actor.graffiti.garden"
const defaultOrigin = "http://localhost:5173"

export default class ActorClient {

  constructor(onChoose=new EventTarget(), origin=defaultOrigin) {
    this.origin = origin

    this.messageEvents = new EventTarget()
    this.initializeEvents = new EventTarget()

    this.chooseEvents = onChoose

    this.initialized = false

    window.onmessage = this.#onIframeMessage.bind(this)

    // Create an iframe...
    this.iframe = document.createElement('iframe')
    this.iframe.src = this.origin

    // ... within a dialog
    this.dialog = document.createElement('dialog')
    this.dialog.className = "graffiti-actor-manager"

    // Click outside of dialog to close
    this.dialog.addEventListener('click', e=>{
      const rect = this.dialog.getBoundingClientRect()
      if (
        rect.top > e.clientY ||
        rect.left > e.clientX ||
        e.clientY > rect.top + rect.height ||
        e.clientX > rect.left + rect.width) {

        this.dialog.close()
      }
    })
    this.dialog.prepend(this.iframe)
    document.body.prepend(this.dialog)
  }

  selectActor() {
    this.dialog.showModal()
  }

  async sign(message) {
    return await this.#sendAndReceive("sign", message)
  }

  async #sendAndReceive(action, data) {
    // Make sure the iframe is set up
    if (!this.initialized) {
      await new Promise(resolve => {
        this.initializeEvents.addEventListener(
          "initialized",
          e=> resolve(),
          { once: true, passive: true }
        )
      })
    }

    // Create a random ID for reply
    const messageID = crypto.randomUUID()
    this.iframe.contentWindow.postMessage({
      messageID,
      action,
      data
    }, this.origin)

    // Wait for a reply via events or throw an error
    const reply = await new Promise(resolve => {
      this.messageEvents.addEventListener(
        messageID,
        e=> resolve(e.data),
        { once: true, passive: true }
      )
    })

    if (reply.error) {
      throw reply.error
    } else {
      return reply.reply
    }
  }

  #onIframeMessage({data}) {
    // Initialize on first message
    if (!this.initialized) {
      this.initialized = true
      this.initializeEvents.dispatchEvent(new Event("initialized"))
    }

    // Close whenever canceled or non-null chosen actor
    if (data.canceled || data.chosen) {
      this.dialog.close()
    }

    if ('chosen' in data) {
      const ev = new Event('chosen')
      ev.uri = data.chosen
      this.chooseEvents.dispatchEvent(ev)
    } else if (data.messageID) {
      const messageEvent = new Event(data.messageID)
      messageEvent.data = data
      this.messageEvents.dispatchEvent(messageEvent)
    }
  }
}