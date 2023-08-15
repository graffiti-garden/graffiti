<script setup>
  import { reactive, ref, nextTick, watch } from 'vue'
  import ActorManager from './actor-manager';
  import DropActor from './DropActor.vue'

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
  const adding = ref(false)
  const creating = ref(false)
  const importing = ref(false)

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
    adding.value = false
    creating.value = false
    createNickname.value = ''
    editing.value = null
    document.activeElement.blur()
  }

  window.onbeforeunload = ()=> {
    selectActor(null)
  }

  // Select the submit button
  // whenever a selection is made
  const selectButton = ref(null)
  watch(selected, s=> { 
    if (s) {
      nextTick(()=> {
        selectButton.value.focus()
      })
    }
  })
</script>

<template>
  <header>
    <button @click="selectActor(null)">
      Close
    </button>
  </header>
  <main>
    <h1>
      <a target="_blank" href="https://graffiti.garden">
        Graffiti Actor Manager
      </a>
    </h1>

    <form v-if="adding">
      <button @click="adding=false;creating=true" class="highlight">
        Create a New Actor
      </button>
      <button @click="adding=false;importing=true" class="highlight">
        Import an Existing Actor
      </button>
      <button @click="adding=false">
        Cancel
      </button>
    </form>
    
    <template v-else-if="creating">

      <form @submit.prevent="
        actorManager.createActor(createNickname);
        creating=false;
        createNickname=''">
        <label for="nickname">
          Choose a private nickname for your actor.
          This nickname is not public and can be changed at any time.
        </label>
        <input type="text" id="nickname" placeholder="Choose a nickname......" v-focus v-model="createNickname">
        <input type="submit" value="Create Actor" class="highlight">
        <button @click="creating=false;createNickname=''">
          Cancel
        </button>
      </form>

    </template>

    <template v-else-if="importing">
      <DropActor :onactor="async (actor, pkcs8Pem)=>{
        await actorManager.updateActor(actor, pkcs8Pem);
        importing=false
      }"/>

      <button @click="importing=false">
        Cancel
      </button>
    </template>

    <template v-else>

      <template v-if="!initialized || !Object.keys(actorManager.actors).length">

        <p>
          Welcome to <a target="_blank" href="https://graffiti.garden">Graffiti</a>!
          Graffiti is a system that connects different social media applications
          so that you can seamlessly migrate between them without losing your data or relationships.
          With a little bit of web programming, you can also modify existing Graffiti applications or create your own.
        </p>

        <p>
          This manager let's you add, delete, and select different
          <em>actors</em> which are your identities within the Graffiti application ecosystem.
        </p>

        <button v-if="!initialized" @click="actorManager.initialize">
          Enable Graffiti on This Site
        </button>
        <form v-else>
          <button @click="creating=true" class="highlight">
            Create a New Actor
          </button>
          <button @click="importing=true" class="highlight">
            Import an Existing Actor
          </button>
        </form>
      </template>

      <template v-else>
        <fieldset>
          <legend>Your Actors</legend>
          <ul>
            <li v-for="actor in Object.values(actorManager.actors)" :key="actor.thumbprint">
              <label :for="actor.thumbprint">
                <input type="radio"
                  :id="actor.thumbprint"
                  :value="actor.thumbprint"
                  v-model="selected"
                  @click="()=> {
                    // Toggle radio button off
                    if (selected == actor.thumbprint) {
                      selected=null;
                    }
                  }">
                <form v-if="editing==actor.thumbprint" @submit.prevent="rename(actor)">
                  <input type="text" v-model="editingNickname" v-focus @focus="$event.target.select()"/>
                </form>
                <span v-else>
                  {{ actor.nickname }}
                </span>
                <div :class="menuOpen==actor.thumbprint?['dropdown','open']:'dropdown'">
                  <button @click.prevent="menuOpen=
                    menuOpen==actor.thumbprint?
                    null:actor.thumbprint">
                    ...
                  </button>
                  <menu
                    v-if="menuOpen==actor.thumbprint"
                    v-click-away="()=>menuOpen=null">
                    <li>
                      <button @click.prevent="
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
                      <button @click.prevent="
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
              <button @click="adding=true">
                Add Actor...
              </button>
            </li>
          </ul>
        </fieldset>

        <button :disabled="!selected" ref="selectButton" @click="selectActor(selected)" :class="selected?'highlight':''">
          <template v-if="selected">
            Log In With <strong>{{ actorManager.actors[selected].nickname }}</strong>
          </template>
          <template v-else>
            Select an Actor to Log In
          </template>
        </button>
      </template>
    </template>
  </main>
</template>