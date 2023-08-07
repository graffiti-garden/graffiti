<script setup>
  import { reactive, ref } from 'vue'
  import ActorManager from './actor-manager';

  // Get the ID of the page
  const searchParams = new URLSearchParams(document.location.search);
  const channelID = searchParams.get("channel")

  const initialized = ref(false)
  const actorManager = new ActorManager(()=> reactive({}))
  actorManager.events.addEventListener("initialized", ()=> {
    initialized.value = true
  })

  function selectActor(thumbprint) {
    actorManager.selectActor(thumbprint, channelID)
    window.close()
  }

  window.onbeforeunload = ()=> {
    actorManager.selectActor(null, channelID)
  }
</script>

<template>
  <header>
    <button @click="selectActor(null)">
      ❌
    </button>
  </header>
  <main v-if="initialized">
    <ul v-if="Object.keys(actorManager.actors).length">
      <li v-for="actor in Object.values(actorManager.actors)" @click="selectActor(actor.thumbprint)">
        {{ actor.nickname }}
      </li>
    </ul>
    <p v-else>
      It looks like you don't have any actors!
      Go to the <a target="_blank" href="/">Graffiti Actor Manager</a> to create some.
    </p>
  </main>
  <main v-else>
    <button @click="actorManager.initialize">
      Enable Graffiti on This Site
    </button>
  </main>
</template>