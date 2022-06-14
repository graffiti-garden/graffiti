import { randomString, sha256 } from './utils.js'

export function queryRewrite(query, allowAnonymous, allowNoTimestamp) {
  if (allowAnonymous && allowNoTimestamp) return query

  const out = { "$and": [ query ] }

  if (allowAnonymous) {
    out.$and.push({ _by: { $exists: true } })
  }
  if (allowNoTimestamp) {
    out.$and.push({ timestamp: { $type: 'number' } })
  }

  return out
}

export async function objectRewrite(object, myID, anonymous, timestamp) {

  // Add a by field and timestamp, if necessary
  if (!anonymous) object._by = myID
  if (timestamp) {
    if (!('timestamp' in object)) {
      object.timestamp = Date.now()
    }
  }

  // Pre-generate the object's ID if it does not already exist
  let idProof = null
  if (!('_id' in object)) {
    idProof = randomString()
    object._id = await sha256(myID.concat(idProof))
  }

  const contextObjectTypes = ['_nearMisses', '_neighbors']

  // Context can be defined at the root level, for short
  if (contextObjectTypes.filter(v=>Object.keys(object).includes(v))) {
    if (!('_contexts' in object)) object._contexts = []

    const context = {}
    for (const type of contextObjectTypes) {
      if (type in object) {
        context[type] = object[type]
        delete object[type]
      }
    }
    object._contexts.push(context)
  }

  // Near misses and neighbors can be defined functionally, for short
  if ('_contexts' in object) {
    for (const context of object._contexts) {
      for (const type of contextObjectTypes) {
        if (type in context) {

          // Apply all functionally defined contexts
          // to the top-level object
          context[type] = context[type].map(p => {
            if (typeof p != 'function') {
              // If it's not a function, just return
              return p
            } else {
              // Deep copy the object and remove _contexts
              const copy = JSON.parse(JSON.stringify(object))
              delete copy._contexts
              // Transform the copied object and return
              p(copy)
              return copy
            }
          })

        }
      }
    }
  }

  return idProof
}
