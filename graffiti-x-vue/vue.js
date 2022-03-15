import GraffitiTools from './graffiti-tools.js'

GraffitiTools.prototype.querySubscriberVue =
  function(vue, resultsName) {
  // Create reactive results and a boolean
  // that let's us know if we can rewind
  const results = vue.reactive({})
  const canRewind = vue.ref(true)

  // Create a subscriber and make it close nicely
  const subscriber = this.querySubscriber(results)
  vue.onBeforeUnmount(subscriber.delete)

  // Augment the rewind function to update
  // the reactive boolean
  Object.assign(subscriber, {rewindOld: subscriber.rewind })
  delete subscriber.rewind
  subscriber.rewind = async function(limit) {
    canRewind.value = await subscriber.rewindOld(limit)
    return canRewind.value
  }

  // Output the results with programmatic variable names
  const output = {}
  output[resultsName] = results
  output[resultsName + 'Sub'] = subscriber
  output[resultsName + 'CanRewind'] = canRewind
  return output
}

export default GraffitiTools
