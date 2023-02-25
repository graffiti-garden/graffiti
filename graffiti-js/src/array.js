// Extend the array class to expose update
// functionality, plus provide some
// useful helper methods
export default function(graffiti) {

  return class GraffitiArray extends Array {

    by(ids) {
      if (typeof ids == 'string') {
        ids = [ids]
      }
      return this.filter(o=> ids.includes(o.actor))
    }

    get mine() {
      return this.filter(o=> o.actor==graffiti.myActor)
    }

    get notMine() {
      return this.filter(o=> o.actor!=graffiti.myActor)
    }

    get actors() {
      return [...new Set(this.map(o=> o.actor))]
    }

    removeMine() {
      this.mine.map(o=> delete o.id)
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
          chain[property] = new GraffitiArray(obj)
        }
        return chain
      }, {})
    }

  }
}
