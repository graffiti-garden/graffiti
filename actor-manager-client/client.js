export default class ActorClient {

  constructor(origin) {
    this.origin = origin??"https://actor.graffiti.garden"
    // this.origin = origin??"http://localhost:5173"
    this.messageEvents = new EventTarget()
    this.selectEvents = new EventTarget()

    window.onmessage = this.#onIframeMessage.bind(this)

    // Create an iframe...
    this.iframe = document.createElement('iframe')
    this.iframe.src = this.origin
    this.iframe.style.display = "none"
    document.body.prepend(this.iframe)
  }

  async selectActor() {
    this.iframe.style.display = "block"

    // Wait for a message
    const selected = await new Promise(resolve => {
      this.selectEvents.addEventListener(
        "selected",
        e=> resolve(e.selected),
        { once: true, passive: true }
      )
    })

    if (!selected) {
      throw "User cancled actor selection."
    }

    return selected
  }

  async sign(message, actor) {
    return await this.#sendAndReceive("sign", { message, actor })
  }

  async verify(signed) {
    return await this.#sendAndReceive("verify", signed)
  }

  async #sendAndReceive(action, message) {
    // Create a random ID for reply
    const messageID = crypto.randomUUID()
    this.iframe.contentWindow.postMessage(
      JSON.parse(JSON.stringify({
        messageID,
        action,
        message
      })),
      this.origin)

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

  #onIframeMessage({data}) {
    if ('messageID' in data) {
      const messageEvent = new Event(data.messageID)
      messageEvent.data = data
      this.messageEvents.dispatchEvent(messageEvent)
    } else if ('selected' in data) {
      const selectEvent = new Event("selected")
      selectEvent.selected = data.selected
      this.selectEvents.dispatchEvent(selectEvent)
    }
  }
}