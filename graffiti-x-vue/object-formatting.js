export function serverFormat(clientObject, now) {
  // Copy the object so we don't modify the original
  const objectCopy = Object.assign({}, clientObject)

  // Add a timestamp if not specified
  if (!('timestamp' in objectCopy)) {
    objectCopy.timestamp = now
  }

  // Extract fields from the object
  // (they're passed in separately on the
  // server for type verification)
  delete objectCopy.nearMisses
  delete objectCopy.access
  return {
    object: objectCopy,
    near_misses: clientObject.nearMisses,
    access: clientObject.access
  }
}

export function clientFormat(serverObject) {
  if (!serverObject) return serverObject
  const clientObject = serverObject.object
  clientObject.nearMisses = serverObject.near_misses
  clientObject.access = serverObject.access
  return clientObject
}
