class OurMentions extends HTMLElement {
  constructor() {
    // Always call super first in constructor
    super();

    // Create a shadow root
    this.shadow = this.attachShadow({mode: 'open'});
  }

  connectedCallback() {
    if(this.hasAttribute('addr')) {
      let addr = this.getAttribute('addr');
      this.ws = new WebSocket("ws://localhost:5000/" + addr);
      this.ws.onmessage = this.onMessage.bind(this);
    }
  }

  async onMessage(e) {
    // Create a child element
    let response = await fetch("http://localhost:5000/" + e.data);
    if (response.ok) {
      let mention = document.createElement('div');
      mention.setAttribute('class','mention');
      mention.innerHTML = await response.text();
      this.shadow.appendChild(mention);
    }
  }
}

customElements.define("our-mentions", OurMentions);
