export default function(graffiti) { return {
  template: `
  <h1>
    Graffiti x Vue
  </h1>

  <p>
    <code class="language-markup">graffiti-x-vue</code> is a library that lets you add custom social components to any static website
    via an extension to the <a href="https://vuejs.org/guide/introduction.html">Vue.js 3</a> Javascript framework that interfaces with the
    <a href="https://github.com/digital-graffiti/server">Graffiti server</a>.
  </p>

  <p>
    On a high level, Graffiti is kind of like a shared database.
    However, unlike a normal database it has some special properties that makes it possible for people with different <router-link to="/context">organization</router-link> and <router-link to="/moderation">moderation</router-link> preferences to use it at the same time.
  </p>

  <p>
    Practically, the library exposes three properties:
    <ul>
      <li>
        <code class="language-js">toggleLogIn</code>:
        A function that let's you log in and out of the Graffiti server via email.
      </li>
      <li>
        <code class="language-js">myID</code>: 
        A unique string associated with your Graffiti account.
      </li>
      <li>
        <code class="language-js">useCollection</code>:
        A <a href="https://vuejs.org/guide/reusability/composables.html">Vue Composable</a> that let's you retrieve and modify dynamic collections of social data from the Graffiti server — this is where the magic happens!
      </li>
    </ul>
  </p>

  <p>
    This guide assumes you are pretty familiar with
    <a href="https://vuejs.org/guide/introduction.html">Vue</a>,
    so we're going to dive straight into building social components.
    These components can be hooked into the library by including the following code at the end of an HTML document within 
    <code class="language-html">&lt;script type="module"&gt;&lt;/script&gt;</code> tags:

    <DisplayCode path="./docs/demos/initialize.js" />
  </p>

  <footer>
    <router-link to="/logging-in">
      Logging In
    </router-link>
  </footer>`
}}
