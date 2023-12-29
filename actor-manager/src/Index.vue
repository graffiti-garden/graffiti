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

  enum UIState {
    Nothing,
    Managing,
    Adding,
    Creating,
    Importing
  }

  // Post messages either to the
  // outside-iframe window or the
  // console, if standalone
  const referrer = document.referrer.length ?
   new URL(document.referrer).origin : null
  const postMessage = referrer?
    function(message: object) {
      window.parent.postMessage(
        message,
        referrer
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
        let actor: Actor
        try {
          actor = await actorManager.getActor(e.uri)
        } catch {
          return
        }
        actors[e.uri] = actor.nickname
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

  // The chosen one
  // aka which actor URI is logged in
  const chosen: Ref<null|string> = ref(null)
  events.addEventListener(
    "choose",
    async (e: ActorAnnouncement)=> {
      chosen.value = e.uri ?? null
      postMessage({ chosen: e.uri })
      resetState()
    }
  )

  const actorManager = new ActorManager(events)

  // Various UI state variables
  const selected: Ref<null|string> = ref(null)
  const uiState: Ref<UIState> = ref(UIState.Nothing)
  const menuOpen: Ref<null|string> = ref(null)
  const createNickname: Ref<string> = ref('')

  // Editing state
  const editing: Ref<null|string> = ref(null)
  const editingNickname: Ref<string> = ref('')
  function rename(uri: string) : void {
    if (!editingNickname.value) return
    actorManager.renameActor(uri, editingNickname.value)
    editing.value = null
  }

  function resetState() {
    uiState.value = UIState.Nothing
    selected.value = null
    menuOpen.value = null
    editing.value = null
    createNickname.value = ''
  }

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

    try {
      switch(data.action) {
        case RequestAction.Sign:
          const message = base64Decode(data.data)
          const signature = await actorManager.sign(message)
          reply.reply = base64Encode(signature)
          break
        case RequestAction.NoncedSecret:
          const nonce = base64Decode(data.data)
          const noncedSecret = await actorManager.noncedSecret(nonce)
          reply.reply = base64Encode(noncedSecret)
          break
        case RequestAction.SharedSecret:
          const theirURI = data.data
          const sharedSecret = await actorManager.sharedSecret(theirURI)
          reply.reply = base64Encode(sharedSecret)
          break
        default:
          reply.error = `Invalid action ${data.action}`
      }
    } catch(e) {
      reply.error = e.toString()
    }

    postMessage(reply)
  }

  function cancel() {
    postMessage({canceled: true})
    resetState()
  }

  window.onbeforeunload = ()=> {
    cancel()
  }

  // Global escape
  document.onkeydown = e=> {
    if (e.key == "Escape") {
      cancel()
      e.preventDefault()
    }
  }

  // Select the submit button
  // whenever a selection is made
  const loginButton: Ref<HTMLInputElement|null> = ref(null)
  watch(selected, s=> { 
    if (s) {
      nextTick(()=> {
        if (loginButton.value) {
          loginButton.value.focus()
        }
      })
    }
  })
</script>

<template>
  <header>
    <button @click="cancel()">
      Close
    </button>
  </header>
  <main>
    <h1>
      <a target="_blank" href="https://graffiti.garden">
        Graffiti Actor Manager
      </a>
    </h1>

    <template v-if="!initialized ||
                    ((uiState==UIState.Nothing || uiState==UIState.Managing) &&
                    !Object.keys(actors).length)">
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

      <form @submit.prevent="">
        <button v-if="!initialized" @click="actorManager.initialize">
          Enable Graffiti on This Site
        </button>
        <template v-else>
          <button @click="uiState=UIState.Creating" class="highlight">
            Create a New Actor
          </button>
          <button @click="uiState=UIState.Importing" class="highlight">
            Import an Existing Actor
          </button>
        </template>
      </form>
    </template>

    <form v-else-if="uiState==UIState.Adding">
      <button @click="uiState=UIState.Creating" class="highlight">
        Create a New Actor
      </button>
      <button @click="uiState=UIState.Importing" class="highlight">
        Import an Existing Actor
      </button>
      <button @click="uiState=UIState.Managing">
        Cancel
      </button>
    </form>
    
    <template v-else-if="uiState==UIState.Creating">

      <form @submit.prevent="
        actorManager.createActor(createNickname);
        uiState=UIState.Managing;
        createNickname=''">
        <label for="nickname">
          Choose a private nickname for your actor.
          This nickname is not public and can be changed at any time.
        </label>
        <input type="text" id="nickname" placeholder="Choose a nickname......" v-focus v-model="createNickname">
        <input type="submit" value="Create Actor" class="highlight">
        <button @click="uiState=UIState.Managing;createNickname=''">
          Cancel
        </button>
      </form>

    </template>

    <template v-else-if="uiState==UIState.Importing">
      <DropActor :onactor="async (actor: Actor)=>{
        await actorManager.storeActor(actor);
        uiState=UIState.Managing;
      }"/>

      <button @click="uiState=UIState.Managing">
        Cancel
      </button>
    </template>

    <template v-else-if="uiState==UIState.Managing || !chosen">
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
            <button @click="uiState=UIState.Adding">
              Add Actor...
            </button>
          </li>
        </ul>
      </fieldset>

      <form>
        <button v-if="selected" @click="actorManager.chooseActor(selected)" class='highlight' ref="loginButton">
          Log In With <strong>{{ actors[selected] }}</strong>
        </button>
        <button v-else disabled>
          Select an Actor to Log In
        </button>
        <button v-if="chosen" @click="uiState=UIState.Nothing">
          Cancel
        </button>
      </form>
    </template>

    <template v-else>
      <div>
        <h3>
          You are logged in as
        </h3>
        <h2>
          {{ actors[chosen] }}
        </h2>
      </div>

      <form>
        <button @click="selected=null;uiState=UIState.Managing" class="highlight">
          Manage Actors
        </button>

        <button @click="actorManager.unchooseActor()">
          Log Out
        </button>
      </form>
    </template>
  </main>
</template>