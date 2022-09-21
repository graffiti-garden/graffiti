export default function({myID, toggleLogIn}) { return {

  setup: ()=> ({ toggleLogIn }),

  data: ()=> ({
    variationsOpen: false
  }),

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
            <a href="" @click.prevent="variationsOpen=true">
              variations
            </a>
            <menu v-if="variationsOpen" v-click-away="()=> variationsOpen=false">
              <li>
                <a href="./minimal.html">
                  minimal
                </a>
              </li>
              <li>
                <a href="./thewall.html">
                  the wall
                </a>
              </li>
            </menu>
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
        <footer>
          made with <a href="..">graffiti</a>
        </footer>
      </main>
    </template>`
}}
