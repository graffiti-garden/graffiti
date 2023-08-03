<script setup>
  import { reactive, ref } from 'vue'
  import ActorManager from './actor-manager';

  const actorManager = new ActorManager(()=> reactive({}))
  const createNickname = ref('')
  const creating = ref(false)

  const editing = ref(false)
  const editingNickname = ref('')
  function rename(actor) {
    if (!editingNickname.value) return
    actorManager.renameActor(actor.thumbprint, editingNickname.value)
    editing.value = ''
  }
</script>

<template>
  <header>
    <h1>
      Graffiti Actor Manager
    </h1>
  </header>
  <main>
    <table>
      <colgroup>
        <col>
        <col>
        <col>
      </colgroup>  
      <tr v-for="actor in Object.values(actorManager.actors)">
        <td>
          <form v-if="editing==actor.thumbprint" @submit.prevent="rename(actor)">
            <input v-model="editingNickname" v-focus @focus="$event.target.select()"/>
          </form>
          <span v-else>
            {{ actor.nickname }}
          </span>
        </td>
        <td>
          <button v-if="editing==actor.thumbprint" @click="rename(actor)">
            Save
          </button>
          <button v-else @click="editing=actor.thumbprint;editingNickname=actor.nickname">
            ️Rename
          </button>
        </td>
        <td>
          <button @click="actorManager.deleteActor(actor.thumbprint)">
            Delete
          </button>
        </td>
      </tr>
    </table>

    <button v-if="!creating" @click="creating=true">
      Create New Actor
    </button>
    <form v-else @submit.prevent="actorManager.createActor(createNickname).then(()=>{createNickname='';creating=false})">
      <input placeholder="Choose a username..." v-focus v-model="createNickname">
      <input type="submit" value="Create Actor">
    </form>
  </main>
</template>