// Extend the array class to expose update
// functionality, plus provide some
// useful helper methods
export default class GraffitiArray extends Array {

  constructor(graffiti, ...elements) {
    super(...elements)
    this.graffiti = graffiti
  }

  get mine() {
    return this.filter(o=> o._by==this.graffiti.myID)
  }

  get notMine() {
    return this.filter(o=> o._by!=this.graffiti.myID)
  }

  get authors() {
    return [...new Set(this.map(o=> o._by))]
  }

  async removeMine() {
    await Promise.all(
      this.mine.map(async o=> await o._remove()))
  }

  #getProperty(obj, propertyPath) {
    // Split it up by periods
    propertyPath = propertyPath.match(/([^\.]+)/g)
    // Traverse down the path tree
    for (const property of propertyPath) {
      obj = obj[property]
    }
    return obj
  }

  sortBy(propertyPath) {

    const sortOrder = propertyPath[0] == '-'? -1 : 1
    if (sortOrder < 0) propertyPath = propertyPath.substring(1)

    return this.sort((a, b)=> {
      const propertyA = this.#getProperty(a, propertyPath)
      const propertyB = this.#getProperty(b, propertyPath)
      return sortOrder * (
        propertyA < propertyB? -1 : 
        propertyA > propertyB?  1 : 0 )
    })
  }

  groupBy(propertyPath) {
    return this.reduce((chain, obj)=> {
      const property = this.#getProperty(obj, propertyPath)
      if (property in chain) {
        chain[property].push(obj)
      } else {
        chain[property] = new GraffitiArray(this.graffiti, obj)
      }
      return chain
    }, {})
  }

}
