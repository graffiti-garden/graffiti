export default class PostArray extends Array {

  constructor(graffiti, context, filterFunction, ...elems) {
    super(...elems)
    this.graffiti = graffiti
    this.context = context
    this.filterFunction = filterFunction?? (()=>true)
  }

  // disable all in-place methods
  push() { 
    throw "To add or remove elements to this array, use PostArray.post, $gf.post, or $gf.delete"
  }
  shift() { this.push() }
  slice() { this.push() }
  unshift() { this.push() }
  pop() { this.push() }
  reverse() { this.push() }
  sort() { this.push() }

  filter(f) {
    return new PostArray(
      this.graffiti,
      this.context,
      o=> f(o) && this.filterFunction(o),
      ...super.filter(f))
  }

  async post(object, actor) {
    actor = actor??this.graffiti.me
    object.actor = actor
    if (!object.context || !object.context.length) {
      object.context = [ this.context ]
    }

    if (!this.filterFunction(object)) {
      throw "The object does not match the arrays filters"
    }

    // MAKE SURE object.context intersects this.context
    if (!object.context.includes(this.context)) {
      throw "The object's context does not match the array's context"
    }

    delete object.actor
    return await this.graffiti.post(object, actor)
  }

  by(...ids) {
    return this.filter(o=> ids.includes(o.actor))
  }

  notBy(...ids) {
    return this.filter(o=> !ids.includes(o.actor))
  }

  get actors() {
    return [...new Set(this.map(o=> o.actor))]
  }

  sortBy(propertyPath) {
    const sortOrder = propertyPath[0] == '-'? -1 : 1
    if (sortOrder < 0) propertyPath = propertyPath.substring(1)

    return this.toSorted((a, b)=> {
      const propertyA = getProperty(a, propertyPath)
      const propertyB = getProperty(b, propertyPath)
      return sortOrder * (
        propertyA < propertyB? -1 : 
        propertyA > propertyB?  1 : 0 )
    })
  }

  groupBy(propertyPath) {
    const reduced = this.reduce((chain, obj)=> {
      const property = getProperty(obj, propertyPath)
      if (property in chain) {
        chain[property].push(obj)
      } else {
        chain[property] = [obj]
      }
      return chain
    }, {})

    // Wrap each vanilla array with
    // the graffiti post array
    for (const property of Object.keys(reduced)) {
      reduced[property] = new PostArray(
        this.graffiti,
        this.context,
        // Make sure the property in the group is maintained
        o=> getProperty(o, propertyPath)==property
            && this.filterFunction(o),
        ...reduced[property])
    }

    return reduced
  }
}

function getProperty(obj, propertyPath) {
  // Split it up by periods
  propertyPath = propertyPath.match(/([^\.]+)/g)
  // Traverse down the path tree
  for (const property of propertyPath) {
    obj = obj[property]
  }
  return obj
}