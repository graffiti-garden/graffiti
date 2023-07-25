import ActorManager from './actor-manager';

const referrer = document.referrer

if (referrer) {
  const am = new ActorManager()
  const origin = new URL(referrer).origin

  window.onmessage = async function({ data }) {
    // Sign or verify messages
    const reply = { messageID: data.messageID }

    const action = data.action
    try {
      if (action == 'sign') {
        const { message, actor } = data.message
        reply.reply = await am.sign(message, actor)

      } else if (action == 'verify') {
        reply.reply = await am.verify(data.message)

      } else if (action == 'select') {
        reply.reply = await am.selectActor()

      } else {
        throw `Invalid action ${action}`
      }
    } catch(e) {
      reply.error = e.toString()
    }

    window.parent.postMessage(reply, origin)
  }
}