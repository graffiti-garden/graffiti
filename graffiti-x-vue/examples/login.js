export default function({ logIn, logOut, loggedIn }) { return {
  setup() {
    return { logIn, logOut, loggedIn }
  },

  template: `
    <button @click="logOut" v-if="loggedIn">
      Log Out
    </button>
    <button @click="logIn" v-else>
      Log In
    </button>`
}}
