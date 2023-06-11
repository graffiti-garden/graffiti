<script setup>
  import { computed, watch } from 'vue';
  import ActorSelector from './ActorSelector.vue'
  import useActorManager from '../actor-manager';

  const referrer = document.referrer
  const origin = referrer? new URL(referrer).origin : 'example.com' 

  const { loggedIn, actors, origins } = useActorManager()

  if (referrer) {

    // Keep track of the actor ID
    // and post to the parent if changed
    const myActorID = computed(()=> 
      origin in origins? origins[origin] : null)
    watch(myActorID, (newID)=>
    window.parent.postMessage(newID, origin))

    window.onmessage = function(data) {
      // TODO: make this sign a message
      console.log(`message from parent: ${data}`)
      postMessage("echo")
    }
  }
</script>

<template>
  <button v-if="!loggedIn" @click="actorManager.logIn">
    Enable Graffiti on This Site
  </button>
  <template v-else>
    <template v-if="Object.keys(actors).length">
      <a href="/">
        ⚙️
      </a>
      <ActorSelector :origin="origin"/>
    </template>
    <a v-else href="/">
      Set Up on Graffiti
    </a>
  </template>
</template>