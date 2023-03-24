import Ajv from "https://cdn.jsdelivr.net/npm/ajv@8.12.0/+esm"
const ajv = new Ajv()

// Extend the array class to expose update
// functionality, plus provide some
// useful helper methods
export default function(me, post, remove) {

  return class GraffitiArray extends Array {

    constructor(context, filterFunction, ...elems) {
      super(...elems)
      this.context = context
      this.filterFunction = filterFunction
    }

    filter(f) {
      return new GraffitiArray(
        this.context,
        o=> f(o) && this.filterFunction(o),
        ...super.filter(f))
    }

    post(object) {
      object.actor = me()
      object.id =
        `graffitiobject://${me().substring(16)}:${crypto.randomUUID()}`
      object.updated = new Date().toISOString()
      object.published = object.updated

      if (!this.filterFunction(object)) {
        throw "The object does not match the arrays filters"
      }

      if ('context' in object) {
        // MAKE SURE object.context intersects this.context
        if (!this.context.some(c=>object.context.includes(c))) {
          throw "The object's context does not match the array's context"
        }
      } else {
        object.context = this.context
      }

      return post(object)
    }

    remove(...objects) {
      for (const object of objects) {
        if (!this.includes(object)) {
          throw "The object can't be removed since it is not in the array"
        } else {
          remove(object)
        }
      }
    }
    
    query(schema) {
      schema.type = 'object'
      const validator = ajv.compile(schema)
      return this.filter(o=> validator(o))
    }

    get mine() {
      return this.filter(o=> o.actor==me())
    }

    get notMine() {
      return this.filter(o=> o.actor!=me())
    }

    by(...ids) {
      return this.filter(o=> ids.includes(o.actor))
    }

    get actors() {
      return [...new Set(this.map(o=> o.actor))]
    }

    removeMine() {
      this.mine.map(o=> remove(o))
    }

    sortBy(propertyPath) {

      const sortOrder = propertyPath[0] == '-'? -1 : 1
      if (sortOrder < 0) propertyPath = propertyPath.substring(1)

      return this.sort((a, b)=> {
        const propertyA = getProperty(a, propertyPath)
        const propertyB = getProperty(b, propertyPath)
        return sortOrder * (
          propertyA < propertyB? -1 : 
          propertyA > propertyB?  1 : 0 )
      })
    }

    groupBy(propertyPath) {
      return this.reduce((chain, obj)=> {
        const property = getProperty(obj, propertyPath)
        if (property in chain) {
          chain[property].push(obj)
        } else {
          chain[property] = new GraffitiArray(
            this.context,
            o=> getProperty(o, propertyPath)==property
                && this.filterFunction(o),
            obj)
        }
        return chain
      }, {})
    }

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
