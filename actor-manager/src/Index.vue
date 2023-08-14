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

  const menuOpen = ref(null)

  const editing = ref(null)
  const editingNickname = ref('')
  function rename(actor) {
    if (!editingNickname.value) return
    actorManager.renameActor(actor.thumbprint, editingNickname.value)
    editing.value = null
  }

  const selected = ref(null)

  const createNickname = ref('')
  const creating = ref(false)

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
    selected.value = null
    creating.value = false
    createNickname.value = ''
    editing.value = null
  }

  window.onbeforeunload = ()=> {
    selectActor(null)
  }
</script>

<template>
  <header>
    <button @click="selectActor(null)">
      Close
    </button>
  </header>
  <main>
    <h1>
      Graffiti Actor Manager
    </h1>
    
    <template v-if="creating">
      Choose a nickname for your actor.
      This nickname is not public and only used within this manager to identify different actors.

      <form @submit.prevent="
        actorManager.createActor(createNickname);
        creating=false;
        createNickname=''">
        <input placeholder="Choose a nickname......" v-focus v-model="createNickname">
        <input type="submit" value="Create Actor">
      </form>
    </template>

    <template v-else>

      <template v-if="!initialized || !Object.keys(actorManager.actors).length">

        <p>
          Welcome to Graffiti!
          Graffiti is an infrastructure underlying different social networks.
        </p>

        <p>
          This manager let's you add, delete, and select different
          <em>actors</em> which are kind of like accounts.
          You might have an actor for 
        </p>

        <p>
          Your actor is kept on your device.
        </p>

        <button v-if="!initialized" @click="actorManager.initialize">
          Enable Graffiti on This Site
        </button>
        <button v-else @click="creating=true">
          Create a New Actor
        </button>
      </template>

      <template v-else>
        <fieldset>
          <legend>Your Actors</legend>
          <ul>
            <li v-for="actor in Object.values(actorManager.actors)" :key="actor.thumbprint">
              <label :for="actor.thumbprint">
                <input type="radio" :id="actor.thumbprint" :value="actor.thumbprint" v-model="selected">
                <form v-if="editing==actor.thumbprint" @submit.prevent="rename(actor)">
                  <input type="text" v-model="editingNickname" v-focus @focus="$event.target.select()"/>
                </form>
                <span v-else>
                  {{ actor.nickname }}
                </span>
                <div class="dropdown">
                  <button @click="menuOpen=
                    menuOpen==actor.thumbprint?
                    null:actor.thumbprint">
                    ...
                  </button>
                  <menu v-if="menuOpen==actor.thumbprint" v-click-away="()=>menuOpen=null">
                    <li>
                      <button @click="
                        menuOpen=null;
                        editing=actor.thumbprint;
                        editingNickname=actor.nickname;">
                        ️Rename
                      </button>
                    </li>
                    <li>
                      <a :href="actorManager.exportActor(actor.thumbprint)" :download="`${actor.nickname}.json`">
                        Export
                      </a>
                    </li>
                    <li>
                      <button @click="
                        menuOpen=null;
                        selected=(selected===actor.thumbprint)?null:selected;
                        actorManager.deleteActor(actor.thumbprint)">
                        Delete
                      </button>
                    </li>
                  </menu>
                </div>
              </label>
            </li>
            <li>
              <button @click="creating=true">
                Add Actor...
              </button>
            </li>
          </ul>
        </fieldset>

        <button @click="selectActor(selected)" :disabled="!selected">
          <template v-if="selected">
            Log In With <strong>{{ actorManager.actors[selected].nickname }}</strong>
          </template>
          <template v-else>
            To Log In, Select an Actor
          </template>
        </button>
      </template>
    </template>
  </main>
</template>