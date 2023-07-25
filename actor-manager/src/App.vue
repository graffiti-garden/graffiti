<script setup>
  import { ref } from 'vue'
  import ActorManager from './actor-manager';

  const am = new ActorManager()
  const name = ref('')
  const creating = ref(false)
</script>

<template>
  <header>
    <h1>
      Graffiti Actor Manager
    </h1>
  </header>
  <main>
    <ul v-if="!creating">
      <li>
        <button @click="creating=true">
          Create New Actor
        </button>
      </li>
      <li>
        <button @click="am.selectActor()">
          View Actors
        </button>
      </li>
    </ul>
    <form v-else @submit.prevent="am.createActor(name).then(()=>{name='';creating=false})">
      <input type="text" autocomplete="username webauthn" placeholder="Choose a username..." v-focus v-model="name">
      <input type="submit" value="Create Actor">
    </form>
  </main>
</template>