<script setup>
  import { reactive, ref } from 'vue'
  import ActorManager from './actor-manager';

  let postMessage = message=> {
    console.log(message)
  }

  const referrer = document.referrer
  if (referrer) {
    const origin = new URL(referrer).origin

    postMessage = message=> {
      window.parent.postMessage(message, origin)
    }
  }

  const initialized = ref(false)
  const actorManager = new ActorManager(
    ()=> reactive({}),
    ()=> {
      initialized.value=true
      postMessage({ initialized: "true" })
    })

  const createNickname = ref('')
  const creating = ref(false)

  const editing = ref(false)
  const editingNickname = ref('')
  function rename(actor) {
    if (!editingNickname.value) return
    actorManager.renameActor(actor.thumbprint, editingNickname.value)
    editing.value = ''
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

  function selectActor(thumbprint) {
    postMessage({selected: thumbprint})
  }

  window.onbeforeunload = ()=> {
    selectActor(null)
  }
</script>

<template>
  <header>
    <h1>
      Graffiti Actor Manager
    </h1>
    <button @click="selectActor(null)">
      ❌
    </button>
  </header>
  <main v-if="!initialized">
    <button @click="actorManager.initialize">
      Enable Graffiti on This Site
    </button>
  </main>
  <main v-else>
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
          <span v-else @click="selectActor(actor.thumbprint)">
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