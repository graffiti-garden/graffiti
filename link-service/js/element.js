export default class OurElement extends HTMLElement {
  constructor() {super();}

  async connectedCallback() {
    // Fetch the inherited address from
    // further up the DOM tree
    let p = this.parentElement;
    while (p) {
      if (p.hasAttribute('addr')) {
        // Apply the address
        let addr = p.getAttribute('addr');
        this.setAttribute('addr-inherited', addr);
        await this.onAddress(addr);
        break;
      }
      p = p.parentElement;
    }
  }

  // Observes changes in address
  static get observedAttributes() {
    return ['addr-inherited'];
  }
  async attributeChangedCallback(name, oldValue, newValue) {
    if (name == 'addr-inherited' && newValue)
      await this.onAddress(newValue);
  }

  // To be filled in by inherited classes
  async onAddress(addr) {}
}
