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
      The composable takes a <a href="https://www.mongodb.com/docs/manual/tutorial/query-documents/">MongoDB query</a> as input and returns a reactive "collection" of all the elements that match the query.
    </p>

    <p>
      The collection acts like an <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array">Array</a>
      and inherits all immutable methods: <code class="language-js">length</code>, <code class="language-js">filter</code>, etc.
      However, whenever <em>anyone</em> changes data on the Graffiti server matching the input query, the collection will reactively change too.
      To modify the collection yourself, you can use the methods <code class="language-js">update</code> and <code class="language-js">remove</code>, which modify the collection both locally and on the Graffiti server.
    </p>

    <p>
      Other than a couple regulated fields that start with <code class="language-js">_</code> (underscore), described in the next sections, data you put into Graffiti is schemaless. So let's invent a new sort of data object that has a property <code class="language-js">action</code> with value <code class="language-js">"boop"</code>.
      In the example below, we form a collection of <a href="https://c.tenor.com/JjZtInaG4pEAAAAd/boop-cat-boop.gif">boops</a>, define a button that creates new boops with <code class="language-js">update</code>, and for each boop create a button that removes that boop with <code class="language-js">remove</code>.

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
      <code class="language-js">update</code> can also be used to replace objects that have been created: just change an existing object and call <code class="language-js">update</code> on it again.
      Here, we have a component that queries for "boops" and "bops" and displays each in a seperate list.
      When you click on an object of one type it will be replaced with an object of the other type.

      <display-code path="./docs/demos/boopbop.js"></display-code>
    </p>

    <p>
      Try it out here. If you don't see anything, make sure to first create some boops up above — changing something in one component will immediately be reflected in the other!

      <div class="component">
        <div class="columns">
          <BoopBop/>
        </div>
      </div>
    </p>

    <h2>
      Helper Methods
    </h2>

    <p>
      Each collection comes with some helper methods to succinctly perform common tasks.
      You'll see these helper methods in use in the next sections, but we'll put them here for reference:
    </p>

    <ul>
    <li>
      <strong><code class="language-js">mine</code></strong>: a shallow copy of the collection containing only objects you created. Equivalent to <code class="language-js">filter(o=>o._by==myID)</code>.
    </li>

    <li>
      <strong><code class="language-js">authors</code></strong>: an array containing the unique user IDs that contributed to the collection. <code class="language-js">authors.length</code> can be used for one-person-one-vote counts, such as counting "upvotes" or "likes. Equivalent to <code class="language-js">[...new Set(collection.map(o=> o._by))]</code>.
    </li>

    <li>
      <strong><code class="language-js">sortBy('some.property')</code></strong>: sorts the collection in ascending order by the property specified in dot notation. To sort in descending order, append <code class="language-js">'-'</code> to the start of the string.
    </li>

    <li>
      <strong><code class="language-js">groupBy('some.property')</code></strong>: groups the collection into subcollections that have equal property values. Returns an object that maps property values onto collections of objects with equal property values like the experimental <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/group">group()</a> method.
    </li>

    <li>
      <strong><code class="language-js">removeMine()</code></strong>: removes all objects in the collection that you have created. <em>Be careful with this function!</em>
    </li>
    </ul>

    <footer>
      <router-link to="/identity">
        Identity
      </router-link>
    </footer>`
}}
