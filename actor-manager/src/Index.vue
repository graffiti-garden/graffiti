<script setup lang="ts">
  import { reactive, ref, nextTick, watch } from 'vue'
  import type { Ref } from 'vue'

  import ActorManager, { base64Decode, base64Encode } from './actor-manager';
  import type { Actor, ActorAnnouncement } from './actor-manager';
  import DropActor from './DropActor.vue'

  enum RequestAction {
    Sign,
    NoncedSecret,
    SharedSecret
  }

  interface RequestMessage {
    messageID: string,
    action: RequestAction,
    data: string
  }

  interface ReplyMessage {
    messageID: string,
    reply?: string
    error?: string
  }

  // Post messages either to the
  // outside-iframe window or the
  // console, if standalone
  const postMessage = document.referrer?
    function(message: object) {
      window.parent.postMessage(
        message,
        new URL(document.referrer).origin
      )
    } :
    function(message: object) {
      console.log(message)
    }

  
  // A place where actor-related are sent
  const events = new EventTarget()

  const initialized = ref(false)
  events.addEventListener(
    "initialized",
    ()=> initialized.value=true
  )

  // Update actors reactively
  // as they change
  const actors: { [uri: string]: string }  = reactive({})
  events.addEventListener(
    "update",
    async (e: ActorAnnouncement)=> {
      if (e.uri) {
        try {
          const actor = await actorManager.getActor(e.uri)
          actors[e.uri] = actor.nickname
        } catch {
          return
        }
      }
    }
  )
  events.addEventListener(
    "delete",
    async (e: ActorAnnouncement)=> {
      if (e.uri) {
        delete actors[e.uri]
      }
    }
  )

  const actorManager = new ActorManager(events)

  // Editing state
  const editing: Ref<null|string> = ref(null)
  const editingNickname: Ref<string> = ref('')
  function rename(uri: string) : void {
    if (!editingNickname.value) return
    actorManager.renameActor(uri, editingNickname.value)
    editing.value = null
  }

  // Various UI state variables
  const menuOpen: Ref<null|string> = ref(null)
  const selected: Ref<null|string> = ref(null)
  const createNickname: Ref<string> = ref('')
  const adding: Ref<boolean> = ref(false)
  const creating: Ref<boolean> = ref(false)
  const importing: Ref<boolean> = ref(false)

  // Save file
  async function download(uri: string) {
    const actor = await actorManager.getActor(uri)

    // Create an element to download it
    const el = document.createElement('a');
    el.style.display = 'none'
    el.setAttribute('href',
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(actor)))
    el.setAttribute('download', `${actor.nickname}.json`)
    document.body.appendChild(el)
    el.click()
    document.body.removeChild(el)
  }

  window.onmessage = async function({ data } : { data: RequestMessage }) {
    // Sign or verify messages
    const reply : ReplyMessage = {
      messageID: data.messageID
    }

    if (!selected.value) {
      reply.error = "No actor selected"
    } else {
      switch(data.action) {
        case RequestAction.Sign:
          const message = base64Decode(data.data)
          const signature = await actorManager.sign(selected.value, message)
          reply.reply = base64Encode(signature)
          break
        case RequestAction.NoncedSecret:
          const nonce = base64Decode(data.data)
          const noncedSecret = await actorManager.noncedSecret(selected.value, nonce)
          reply.reply = base64Encode(noncedSecret)
          break
        case RequestAction.SharedSecret:
          const theirURI = data.data
          const sharedSecret = await actorManager.sharedSecret(selected.value, theirURI)
          reply.reply = base64Encode(sharedSecret)
          break
        default:
          reply.error = `Invalid action ${data.action}`
      }

      postMessage(reply)
    }
  }

  function selectActor(uri: string|null) {
    postMessage({selected: uri})
    selected.value = null
    adding.value = false
    creating.value = false
    createNickname.value = ''
    editing.value = null
  }

  window.onbeforeunload = ()=> {
    selectActor(null)
  }

  // Global escape
  document.onkeydown = e=> {
    if (e.key == "Escape") {
      selectActor(null)
      e.preventDefault()
    }
  }

  // Select the submit button
  // whenever a selection is made
  const selectButton: Ref<HTMLInputElement|null> = ref(null)
  watch(selected, s=> { 
    if (s) {
      nextTick(()=> {
        if (selectButton.value) {
          selectButton.value.focus()
        }
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
      <DropActor :onactor="async (actor: Actor)=>{
        await actorManager.storeActor(actor);
        importing=false
      }"/>

      <button @click="importing=false">
        Cancel
      </button>
    </template>

    <template v-else>

      <template v-if="!initialized || !Object.keys(actors).length">

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
            <li v-for="[uri, nickname] of Object.entries(actors)" :key="uri">
              <label :for="uri">
                <input type="radio"
                  :id="uri"
                  :value="uri"
                  v-model="selected"
                  @click="()=> {
                    // Toggle radio button off
                    if (selected == uri) {
                      selected=null;
                    }
                  }">
                <form v-if="editing==uri" @submit.prevent="rename(uri)">
                  <input type="text" v-model="editingNickname" v-focus @focus="($event.target as HTMLInputElement).select()"/>
                </form>
                <span v-else>
                  {{ nickname }}
                </span>
                <div :class="menuOpen==uri?['dropdown','open']:'dropdown'">
                  <button @click.prevent="menuOpen=menuOpen==uri?null:uri">
                    ...
                  </button>
                  <menu
                    v-if="menuOpen==uri"
                    v-click-away="()=>menuOpen=null">
                    <li>
                      <button @click.prevent="
                        menuOpen=null;
                        editing=uri;
                        editingNickname=nickname;">
                        ️Rename
                      </button>
                    </li>
                    <li>
                      <button @click.prevent="download(uri)">
                        Export
                      </button>
                    </li>
                    <li>
                      <button @click.prevent="
                        menuOpen=null;
                        selected=(selected===uri)?null:selected;
                        actorManager.deleteActor(uri)">
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
            Log In With <strong>{{ actors[selected] }}</strong>
          </template>
          <template v-else>
            Select an Actor to Log In
          </template>
        </button>
      </template>
    </template>
  </main>
</template>