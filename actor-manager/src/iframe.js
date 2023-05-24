import ActorManager from './actor-manager.js'
import { createApp } from "https://cdnjs.cloudflare.com/ajax/libs/vue/3.2.45/vue.esm-browser.min.js"

// Post messages to parent
const origin = new URL(document.referrer).origin
function postMessage(message) {
  window.parent.postMessage(message, origin)
}

const app = {
  data() {
    return {
      storageGranted: false
    }
  },

  created() {
    //this.storageGranted = !!localStorage.getItem("storageGranted2")
    //if (this.storageGranted) {
      //this.actorManager = new ActorManager()
      //this.actorManager.onchange = this.onActorChange.bind(this)
    //}
  },

  methods: {
    async login() {
      await document.requestStorageAccess()
      console.log(await document.hasStorageAccess())
      console.log("successfully got storage!")
      console.log("Now getting manager")
    window.open(`./#new-app/${encodeURIComponent(origin)}`, '_blank')
      this.storageGranted = true
      this.actorManager = new ActorManager()
      this.actorManager.onchange = this.onActorChange.bind(this)
    //}

    },

    onActorChange(message) {
      console.log("Got a message from the manager!!")
      console.log(message)
    }
  }
}

createApp(app).mount('#app')


// wait for storage

// Keep track of which actors have exist
// and whether the origin is allowed
//const actors = {}
//let originAllowed = false

//console.log("iframe!")

// Establish a connection with the manager
//const actorManager = new ActorManager()
//actorManager.onchange = ({ action, payload })=> {
  //console.log("got a thing!")
  //console.log(action)
  //console.log(payload)
  //if (action.endsWith("actor")) {
    //const { nickname, thumbprint } = payload
    //if (originAllowed) {
      //if (action.startsWith("update")) {
        //postMessage({
          //action: "update",
          //actor: { nickname, thumbprint }
        //})
        //actors[thumbprint] = nickname
      //} else {
        //postMessage({
          //action: "remove",
          //actor: { thumbprint }
        //})
        //if (thumbprint in actors) {
          //delete actors[thumbprint]
        //}
      //}
    //}
  //} else if (action.endsWith("origin")) {
    //if (origin == payload) {
      //if (action.startsWith("update")) {
        //if (!originAllowed) {
          //// Send any existing thumbprints
          //for (const [thumbprint, nickname] of Object.entries(actors)) {
            //postMessage({
              //action: "update",
              //actor: { nickname, thumbprint }
            //})
          //}
        //}
        //originAllowed = true
      //} else {
        //if (originAllowed) {
          //// Remove all thumbprints
          //for (const [thumbprint, nickname] of Object.entries(actors)) {
            //postMessage({
              //action: "remove",
              //actor: { thumbprint }
            //})
          //}
        //}
        //originAllowed = false
      //}
    //}
  //}
//}

//window.onmessage = async function({data: {action, messageID, payload}}) {
  //// Reply with the message ID
  //// so messages are forwarded appropriately
  //const output = {
    //action: "reply",
    //messageID
  //}

  //if (action == 'sign') {
    //const { thumbprint, message } = payload
    //try {
      //output.jwt = await actors.sign(actor, origin, message)
    //} catch(e) {
      //output.error = e.toString()
    //}
  //}

  //postMessage(output)
//}
