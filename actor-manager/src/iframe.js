import ActorManager from './actor-manager';

const actorManager = new ActorManager()
window.actorManager = actorManager
actorManager.events.addEventListener("initialized", ()=> {
  postMessage({initialized: true})
})

let postMessage = message=> {
  console.log(message)
}

const referrer = document.referrer
if (referrer) {
  const origin = new URL(referrer).origin

  postMessage = message=> {
    window.parent.postMessage(message, origin)
  }
}

window.onmessage = async function({ data }) {
  // Sign or verify messages
  const reply = { messageID: data.messageID }

  const action = data.action
  try {
    if (action == 'sign') {
      const { message, actor } = data.message
      reply.reply = await actorManager.sign(message, actor)

    } else if (action == 'verify') {
      reply.reply = await actorManager.verify(data.message)

    } else {
      throw `Invalid action ${action}`
    }
  } catch(e) {
    reply.error = e.toString()
  }

  postMessage(reply)
}

// Add an event listener for selections
actorManager.events.addEventListener("selected", e=> {
  postMessage({selected: e.thumbprint})
})

// Send the channel to the client so they
// know which select window to open
postMessage({channelID: actorManager.channelID})