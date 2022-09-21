export default function({myID, toggleLogIn}) { return {

  setup: ()=> ({ toggleLogIn }),

  template: `
    <template v-if="${!myID}">

      <dialog>
        <h1>
          <router-link to="/">
            namebook
          </router-link>
        </h1>
        <button @click="toggleLogIn">
          log in with graffiti
        </button>
      </dialog>

    </template>
    <template v-else>

      <header>
        <menu>
          <li>
            <router-link to="/">
              feed
            </router-link>
          </li>
          <li>
            <router-link to="/profile/${myID}">
              my profile
            </router-link>
          </li>
          <li>
            <router-link to="/directory">
              namebook
            </router-link>
          </li>
          <li>
            <a href="" @click.prevent="toggleLogIn">
              log out
            </a>
          </li>
        </menu>
      </header>

      <main>
        <router-view></router-view>
      </main>
    </template>`
}}
