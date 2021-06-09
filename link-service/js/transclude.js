import OurElement from './element.js';

export default class OurTransclude extends OurElement {
  constructor() {super();}
  async onAddress(addr) {
    super.onAddress(addr);

    let response = await fetch("http://localhost:5000/" + addr);
    if (response.ok) {
      this.innerHTML = await response.text();
    } else {
      this.innerHTML = "";
    }
  }
}
