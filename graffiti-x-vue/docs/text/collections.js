import Boop from '../demos/boop.js'
import BoopBop from '../demos/boopbop.js'

export default function(graffiti) { return {
  components: {
    Boop: Boop(graffiti),
    BoopBop: BoopBop(graffiti)
  },

  template: `
    <h1 id="collections">
      Collections
    </h1>

    <p>
      Collections of social data in Graffiti are formed by arbitrary <em>queries</em> as compared to directory listings in a file system or the channels/rooms of a chat client.
      We can interface with these collections in Vue with the <code class="language-js">useCollection</code> <a href="https://vuejs.org/guide/reusability/composables.html">composable</a>.
      The composable takes a <a href="https://www.mongodb.com/docs/manual/tutorial/query-documents/">MongoDB query</a> as input and returns three properties:
      <ul>
        <li>
          <code class="language-js">objects</code>:
          a reactive array of all the objects in the server that match the input query.
        </li>
        <li>
          <code class="language-js">update</code>:
          a function to add or replace an object matching the query to the server.
        </li>
        <li>
          <code class="language-js">remove</code>:
          a function to remove an object matching the query from the server
        </li>
      </ul>
    </p>

    <p>
      Other than a couple regulated fields that start with <code class="language-js">_</code> described in the next sections, data you put into Graffiti is schemaless. So let's invent a new sort of data object that has a property <code class="language-js">type</code> with value <code class="language-js">"boop"</code>.
      In the example below, we form a collection of <a href="https://c.tenor.com/JjZtInaG4pEAAAAd/boop-cat-boop.gif">boops</a> and define a button that creates new boops with <code class="language-js">update</code> and for each boop create a button that removes that boop with <code class="language-js">remove</code>.

      <display-code path="./docs/demos/boop.js"></display-code>
    </p>

    <p>
      Try it out below!
      To add or remove data to Graffiti you'll need to be logged in, so make sure you're logged in with the button we made in the <router-link to="/logging-in">§Logging In</router-link>.

      <div class="component">
        <Boop/>
      </div>
    </p>

    <p>
      Our boops are stored in the Graffiti server so they will persist even if you refresh the page or log out and back in.
      They also immediately synchronize between different clients — try opening this guide in two side-by-side windows and see what happens when you "boop".
    </p>

    <h2>
      Replacements
    </h2>

    <p>
      <code class="language-js">update</code> can also be used to replace objects that have been created, just change an existing object and call <code class="language-js">update</code> on it again.
      Here, we have a component that queries for "boops" and "bops" and displays each in a seperate list.
      When you click on an object of one type it will be replaced with an object of the other type.

      <display-code path="./docs/demos/boopbop.js"></display-code>
    </p>

    <p>
      Try it out here. If you don't see anything, make sure to first create some boops up above — changing something in one component will immediately be reflected in the other!

      <div class="component">
        <BoopBop/>
      </div>
    </p>

    <footer>
      <router-link to="/context">
        Context
      </router-link>
    </footer>`
}}
