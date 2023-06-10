<script setup>
  import { ref } from 'vue'
  import useActorManager from '../actor-manager'

  const { actorManager, actors } = useActorManager()

  const editing = ref('')
  const nickname = ref('')

  function rename(actor) {
    if (!nickname.value) return
    actorManager.rename(actor, nickname.value)
    editing.value = ''
  }

  function removeActor(actor) {
    const c = confirm("Are you absolutely sure you want to delete this actor? This can't be undone.")
    if (!c) return

    actorManager.removeActor(actor)
  }
</script>

<template>
  <p>
    Your actors are listed below.
    The names displayed with each actor are for your own
    organization and are not visible to anyone else.
  </p>

  <table>
    <tr v-for="actor in actors">
      <td>
        <form v-if="editing==actor.thumbprint" @submit.prevent="rename(actor)">
          <input v-model="nickname" v-focus @focus="$event.target.select()"/>
        </form>
        <span v-else>
          {{ actor.nickname }}
        </span>
      </td>
      <td>
        <button v-if="editing==actor.thumbprint" @click="rename(actor)">
          Save
        </button>
        <button v-else @click="editing=actor.thumbprint;nickname=actor.nickname">
          ️Rename
        </button>
      </td>
      <td>
        <button @click="removeActor(actor)">
          Delete
        </button>
      </td>
    </tr>
  </table>

  <form @submit.prevent="actorManager.createActor('My New Actor')">
    <input type="submit" value="Create New Actor"/>
  </form>
</template>