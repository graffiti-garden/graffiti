<script setup>
  import { computed, watch } from 'vue';
  import ActorSelector from './ActorSelector.vue'
  import useActorManager from '../actor-manager';

  const referrer = document.referrer
  const origin = referrer? new URL(referrer).origin : 'example.com' 

  const { actorManager, loggedIn, actors, origins } = useActorManager()

  if (referrer) {
    // Keep track of the actor ID
    // and post to the parent if changed
    const myActorID = computed(()=> 
      origin in origins? origins[origin] : null)
    watch(myActorID, (newID)=>
    window.parent.postMessage({
      actorID: newID
    }, origin))

    window.onmessage = async function({data: {messageID, message}}) {
      // Sign any Messages from the parent
      const reply = { messageID }
      try {
        reply.signedMessage = await actorManager.sign(message, origin)
      } catch(e) {
        reply.error = e.toString()
      }
      window.parent.postMessage(reply, origin)
    }
  }
</script>

<template>
  <main>
    <button v-if="!loggedIn" @click="actorManager.logIn">
      Enable Graffiti on This Site
    </button>
    <template v-else>
      <template v-if="Object.keys(actors).length">
        <ActorSelector :origin="origin"/>
        <a href="/">
          Go To Actor Manager 🔗
        </a>
      </template>
      <a v-else href="/">
        Set Up on Graffiti
      </a>
    </template>
  </main>
</template>