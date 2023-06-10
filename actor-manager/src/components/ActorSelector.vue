<script setup>
  import { computed } from 'vue'
  import useActorManager from '../actor-manager'

  const { origin } = defineProps(['origin'])
  const { actorManager, actors, origins } = useActorManager()

  const selectedThumbprint = computed(()=>
   origin in origins? origins[origin] : 'null')

  function update(event) {
    const thumbprint = event.target.value

    if (thumbprint == "remove") {
      actorManager.removeOrigin(origin)
    } else {
      actorManager.updateOrigin(origin, thumbprint)
    }
  }
</script>

<template>
  <select :value="selectedThumbprint" @change="update">
    <option v-if="selectedThumbprint!='null'" value="remove">
      No actor
    </option>
    <option disabled v-else value="null">
      Choose an actor...
    </option>
    <option v-for="actor in actors" :value="actor.thumbprint">
      {{ actor.nickname }}
    </option>
  </select>
</template>