export default class ActorClient {
  constructor(origin="https://actor.graffiti.garden") {
    this.origin = origin
    this.messageEvents = new EventTarget()

    window.onmessage = this.#onIframeMessage.bind(this)

    // Create an iframe within a dialog
    this.iframe = document.createElement('iframe')
    this.iframe.src = this.origin + '/iframe.html'
    this.iframe.allow = "publickey-credentials-get *"
    this.iframe.width = "1"
    this.iframe.height = "1"
    this.iframe.style.border = "none"
    this.iframe.style.position = "fixed"
    this.iframe.style.top = "0"
    this.iframe.style.left = "0"
    document.body.prepend(this.iframe)
  }

  async #sendAndReceive(action, message) {
    this.iframe.focus()
    // Create a random ID for reply
    const messageID = crypto.randomUUID()
    console.log(this.origin)
    this.iframe.contentWindow.postMessage({messageID, action, message}, this.origin)

    // Wait for a reply via events or throw an error
    const data = await new Promise(resolve => {
      this.messageEvents.addEventListener(
        messageID,
        e=> resolve(e.data),
        { once: true, passive: true }
      )
    })

    if ('reply' in data) {
      return data.reply
    } else {
      throw data.error
    }
  }

  async selectActor() {
    return await this.#sendAndReceive("select")
  }

  async sign(message, actor) {
    return await this.#sendAndReceive("sign", { message, actor })
  }

  async verify(signed) {
    return await this.#sendAndReceive("verify", signed)
  }

  #onIframeMessage({data}) {
    const messageEvent = new Event(data.messageID)
    messageEvent.data = data
    this.messageEvents.dispatchEvent(messageEvent)
  }
}