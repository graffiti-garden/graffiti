export default function({myID, toggleLogIn}) { return {

  setup: ()=> ({ toggleLogIn }),

  template: `
    <template v-if="${!myID}">

      <main>
        <h1>
          <u>
            namebook
          </u>
        </h1>
        <h2>
          <button @click="toggleLogIn">
            log in with graffiti
          </button>
        </h2>
      </main>

    </template>
    <template v-else>

      <header>
        <ul>
          <li>
            <u>
              <router-link to="/">
                namebook
              </router-link>
            </u>
          </li>
          <li>
            <router-link to="/profile/${myID}">
              my profile
            </router-link>
          </li>
          <li>
            <a href="" @click.prevent="toggleLogIn">
              log out
            </a>
          </li>
        </ul>
      </header>

      <main>
        <router-view></router-view>
      </main>
    </template>`
}}
