<script setup>
  import { reactive } from 'vue'
  import ActorManager from './actor-manager';

  const actorManager = new ActorManager(()=> reactive({}))

  let postMessage = message=> {
    console.log(message)
  }
  function selectActor(thumbprint) {
    postMessage({selected: thumbprint})
  }
  function close() {
    postMessage({close: "true"})
  }

  const referrer = document.referrer
  if (referrer) {
    const origin = new URL(referrer).origin

    postMessage = message=> {
      window.parent.postMessage(message, origin)
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
  }
</script>

<template>
  <header>
    <button @click="close()">
      ❌
    </button>
  </header>
  <main>
    <ul>
      <li v-for="actor in Object.values(actorManager.actors)" @click="selectActor(actor.thumbprint)">
        {{ actor.nickname }}
      </li>
    </ul>
  </main>
</template>