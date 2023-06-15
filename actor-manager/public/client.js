export default class ActorClient {
  constructor(origin="https://actor.graffiti.garden") {
    this.origin = origin
    this.actorID = null
    this.onActorChange = ()=>{}
    this.messageEvents = new EventTarget()

    window.onmessage = this.#onIframeMessage.bind(this)

    // Create an iframe within a dialog
    this.iframe = document.createElement('iframe')
    this.iframe.src = origin + '/iframe.html'
    this.dialog = document.createElement('dialog')
    this.dialog.innerHTML = `
      <form method="dialog">
        <button>Close</button>
      </form>`
    // Click outside of dialog to close
    this.dialog.addEventListener('click', e=>{
      const rect = this.dialog.getBoundingClientRect()
      if (
        rect.top > e.clientY ||
        rect.left > e.clientX ||
        e.clientY > rect.top + rect.height ||
        e.clientX > rect.left + rect.width)
        this.dialog.close()
    })
    this.dialog.prepend(this.iframe)
    document.body.prepend(this.dialog)
  }

  manageActors() {
    this.dialog.showModal()
  }

  async signMessage(message) {
    // Create a random ID for reply
    const messageID = crypto.randomUUID()
    this.iframe.contentWindow.postMessage({messageID, message}, this.origin)

    // Wait for a reply via events or throw an error
    const data = await new Promise(resolve => {
      this.messageEvents.addEventListener(
        messageID,
        e=> resolve(e.data),
        { once: true, passive: true }
      )
    })

    if ('signedMessage' in data) {
      return data.signedMessage
    } else {
      throw data.error
    }
  }

  #onIframeMessage({data}) {
    if ('actorID' in data) {
      this.actorID = data.actorID
      this.onActorChange(this.actorID)
    } else {
      const messageEvent = new Event(data.messageID)
      messageEvent.data = data
      this.messageEvents.dispatchEvent(messageEvent)
    }
  }
}