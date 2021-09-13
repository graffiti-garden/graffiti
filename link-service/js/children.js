import OurElement from './element.js';

export default class OurChildren extends OurElement {
  constructor() {super();}

  async onAddress(addr) {
    // Open a websocket
    super.onAddress(addr);
    this.ws = new WebSocket('ws://' + this.gateway + addr);
    this.ws.onmessage = this.onMessage.bind(this);
  }

  async onMessage(e) {
    // Ping Pong to keep alive
    if (e.data == 'ping') {
      this.ws.send('pong');
      return;
    }

    // Add the children
    await onChild(e.data)
  }

  // To be filled in by inherited classes
  async onChild(addr) {}
}
