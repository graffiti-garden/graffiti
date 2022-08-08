import Booper from '../demos/boop.js'

export default function(graffiti) { return {
  components: {
    Booper: Booper(graffiti)
  },

  template: `
    <h1 id="collections">
      Collections
    </h1>

    <p>
      Collections of social data in Graffiti are formed by arbitrary <em>queries</em> rather than the directories of a file structure or the tables of a SQL database.
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
      In the example below, we form a collection of <a href="https://c.tenor.com/JjZtInaG4pEAAAAd/boop-cat-boop.gif">boops</a> and define a button that creates new boops with <code class="language-js">update</code>.
      <display-code path="./docs/demos/boop.js"></display-code>

      We've also created a "boop display" component to view and delete our boops using <code class="language-js">remove</code> (we've separated this component out to reuse in future examples).
      <display-code path="./docs/demos/boop-display.js"></display-code>
    </p>

    <p>
      Try it out below!
      To add or remove data to Graffiti you'll need to be logged in, so make sure you're logged in with the button we made in the <router-link to="/logging-in">§Logging In</router-link>.

      <div class="component">
        <Booper/>
      </div>
    </p>

    <p>
      Our boops are stored in the Graffiti server so they will persist even if you refresh the page or log out and back in.
      They also immediately synchronize between different clients — try opening this guide in two side-by-side windows and see what happens when you "boop".
    </p>

    <footer>
      <router-link to="/context">
        Context
      </router-link>
    </footer>`
}}
