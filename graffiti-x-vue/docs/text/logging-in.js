import LogIn from '../demos/login.js'

export default function(graffiti) { return {
  components: { LogIn: LogIn(graffiti) },

  template: `
    <h1 id="loggingin">
      Logging In
    </h1>

    <p>
      First, let's make a component for logging in and out.
      Since
      <code class="language-js">myID</code>
      is only defined when you're logged in, we can use it to determine whether our log-in button should say "Log In" or "Log Out". We'll also display
      <code class="language-js">myID</code>
      once you're logged in, just so you can see what it looks like.
      The ID is pretty ugly, so it's best to avoid exposing it to users.
    </p>

    <display-code path="./docs/demos/login.js"></display-code>

    <p>
      Try it out:

      <div class="component">
        <LogIn/>
      </div>
    </p>

    <footer>
      <router-link to="/collections">
        Collections
      </router-link>
    </footer>`
}}
