export default function(useGraffiti) { return {

  setup: ()=> useGraffiti(null),

  template: `
    <button @click="logOut" v-if="loggedIn">
      Log Out
    </button>
    <button @click="logIn" v-else>
      Log In
    </button>`
}}
