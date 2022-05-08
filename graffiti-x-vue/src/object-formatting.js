export function serverFormat(clientObject) {
  // Copy the object so we don't modify the original
  const objectCopy = Object.assign({}, clientObject)

  // TODO:
  // Expansion of contexts

  // Extract fields from the object
  // (they're passed in separately on the
  // server for type verification)
  delete objectCopy._contexts
  return {
    object: objectCopy,
    contexts: clientObject._contexts,
  }
}

export function clientFormat(serverObject) {
  if (!serverObject) return serverObject
  const clientObject = serverObject.object
  clientObject._contexts = serverObject.contexts
  return clientObject
}
