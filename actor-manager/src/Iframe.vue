<script setup>
  import { reactive } from 'vue'
  import ActorManager from './actor-manager';

  const actorManager = new ActorManager(()=> reactive({}))

  let selectActor = thumbprint=>{
    console.log(`Selected actor: ${thumbprint}`)
  }

  const referrer = document.referrer
  if (referrer) {
    const origin = new URL(referrer).origin

    selectActor = thumbprint=> {
      window.parent.postMessage({
        selected: thumbprint
      }, origin)
    }

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

        } else {
          throw `Invalid action ${action}`
        }
      } catch(e) {
        reply.error = e.toString()
      }

      window.parent.postMessage(reply, origin)
    }
  }
</script>

<template>
  <main>
    <ul>
      <li v-for="actor in Object.values(actorManager.actors)" @click="selectActor(actor.thumbprint)">
        {{ actor.nickname }}
      </li>
    </ul>
  </main>
</template>