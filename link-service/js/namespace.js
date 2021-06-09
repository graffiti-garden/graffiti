export default class OurNamespace extends HTMLElement {
  constructor() {super();}

  // Set a null address if none exists
  connectedCallback() {
    if (!this.hasAttribute('addr'))
      this.setAttribute('addr', '0');
  }

  // Listen for changes to the address
  static get observedAttributes() {
    return ['addr'];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if ((name == 'addr') && newValue)
      // Propagate the address change over the DOM
      this.propogateAddress(this, newValue);
  }

  propogateAddress(node, addr) {
    // Perform a depth-first search
    node = node.firstElementChild;
    while (node) {

      if (node.hasAttribute('addr-inherited')) {
        // Update the attribute and stop propagating
        node.setAttribute('addr-inherited', addr);

      } else if (!node.hasAttribute('addr')) {
        // Otherwise, explore further down the tree
        // (if it's not a namespace!)
        this.propogateAddress(node, addr);
      }

      // Move to the next branch of tree
      node = node.nextElementSibling;
    }
  }
}
