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
  delete objectCopy.contexts
  delete objectCopy.access
  return {
    object: objectCopy,
    contexts: clientObject.contexts,
  }
}

export function clientFormat(serverObject) {
  if (!serverObject) return serverObject
  const clientObject = serverObject.object
  clientObject.contexts = serverObject.contexts
  return clientObject
}
