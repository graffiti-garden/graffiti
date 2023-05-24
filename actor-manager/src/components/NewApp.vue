<script setup>
  import { inject, ref, defineProps } from 'vue'
  import { useRouter } from 'vue-router'

  const router = useRouter()
  const actorManager = inject('actorManager')
  const actors = inject('actors')

  const props = defineProps(['origin'])

  const selectedThumbprint = ref(null)

  function save() {
    if (selectedThumbprint.value) {
      actorManager.updateOrigin(props.origin, selectedThumbprint.value)
      router.push('/apps')
    }
  }
</script>

<template>
  <p>
    An application hosted at the following domain would like access to one of your Graffiti actors.
    <code>
      {{origin}}
    </code>
  </p>

  <p>
    Which actor would you like it to use?
    You can select a different actor or revoke access at any time.
  </p>

  <form @submit.prevent="save">
    <select v-model="selectedThumbprint">
      <option disabled :value="null">
        Select an actor
      </option>
      <option v-for="actor in actors" :value="actor.thumbprint">
        {{ actor.nickname }}
      </option>
    </select>
    <input type="submit" value="Save"/>
    <input type="button" value="Cancel" @click="router.push('/apps')"/>
  </form>
</template>