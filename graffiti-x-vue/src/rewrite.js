import { randomString, sha256 } from './utils.js'

export function queryRewrite(query, allowNoTimestamp) {
  if (!allowNoTimestamp) {
    return { "$and": [
      query, 
      { timestamp: { $type: 'number' } }
    ]}
  } else {
    return query
  }
}

export async function objectRewrite(object, myID, timestamp) {

  // Add by/to fields
  object._by = myID
  if ('_to' in object) {
    if (!Array.isArray(object._to)) {
      throw new Error("_to must be an array")
    } 
    const i = object._to.indexOf(myID)
    if (object._to.indexOf(myID) < 0) {
      object._to.push(myID)
    }
  } else {
    object._to = [myID]
  }

  // Add a timestamp, if necessary
  if (timestamp) {
    if (!('timestamp' in object)) {
      object.timestamp = Date.now()
    }
  }

  // Pre-generate the object's ID if it does not already exist
  if (!('_id' in object && '_idProof' in object)) {
    object._idProof = randomString()
    object._id = await sha256(myID.concat(object._idProof))
  }
}
