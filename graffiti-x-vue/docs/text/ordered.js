import CompareTODOOrder from '../demos/comparetodoorder.js'

export default function(graffiti) { return {
  components: {
    CompareTODOOrder: CompareTODOOrder(graffiti)
  },

  template: `
    <h1>Ordered Lists</h1>

    <p>
      In <router-link to="/identity">§Identity</router-link> we created a to-do list that was sorted chronologically,
      but what about making a to-do list with a particular order?
      This critical for things like collaborative playlists à la Spotify or collaborative text-editing à la Google Docs.
      In normal programming languages, you can insert items into arrays by reffering to a particular index,
      but in Graffiti that could cause all sorts of problems due to concurrency and overlapping queries.
    </p>

    <p>
      For example, say a group of people is querying for items in a collaborative list, but one of those people is filtering out all entries by a particular person they do not like.
      The indices in that person's list will be inconsistent with everyone else's.
    </p>

    <p>
      We can solve this using something called a <a href="https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type">Conflict-Free Replicated Data Type (CRDT)</a>.
      There are many sorts of CRDTs for different situations but the one we are going to use is called <a href="https://ieeexplore.ieee.org/abstract/document/5158450">Logoot</a>.
      Essentially, each object in a list is going to be assigned a property <code class="language-js">order</code> between 0 and 1 and to put the objects in order, we simply need to sort them by that property.
      To insert an object between objects at 0.5 and 0.7, say, we set that object's <code class="language-js">order</code> to 0.6.
    </p>

    <p>
      Things are a bit trickier because we can't keep dividing floating point numbers forever and because we will need to add some randomness to prevent collisions at an exact midpoint.
      But you don't need to worry about that because we've implimented Logoot for you.
      Our implimentation exposes the following properties:
      <ul>
        <li>
          <code class="language-js">between(a, b)</code>:
          for any <i>a</i> ≠ <i>b</i>
          this returns a <i>c</i> such that either
          <i>a</i> &lt; <i>c</i> &lt <i>b</i>
          or
          <i>b</i> &lt; <i>c</i> &lt <i>a</i>.
        </li>
        <li>
          <code class="language-js">compare(a, b)</code>: a compare function that can be used with Javascript's built-in <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort">sort()</a> method which returns 1 if <i>a</i> &gt; <i>b</i>, -1 if <i>a</i> &lt; <i>b</i>, and 0 if <i>a</i> = <i>b</i>.
        </li>
        <li>
          <code class="language-js">before</code>: the start of a list, kind of like the number zero.
        </li>
        <li>
          <code class="language-js">after</code>: the end of a list, kind of like the number one.
        </li>
        <li>
          <code class="language-js">query(property)</code>: a MongoDB query specifying a Logoot value named <code class="language-js">property</code>.
        </li>
      </ul>
    </p>

    <p>
      In the example below we have two copies of a to-do list where to-dos in the second list are filtered out if they have an odd number of letters.
      Using Logoot, modifying the order in one will remain consistent with the order in the other.

      <div class="component">
        <CompareTODOOrder/>
      </div>
    </p>

    <p>
      Each list is displayed using the following component which sorts the objects by the <code class="language-js">Logoot.compare</code> and provides controls that move an object by placing it <code class="language-js">between</code> surrounding objects.

      <DisplayCode path="./docs/demos/ordertodos.js" />
    </p>

    <p>
      The following outer component adds a method that creates to-dos with an initial order equal to a position <code class="language-js">between</code> the start of the list, <code class="language-js">Logoot.before</code>, and either the first object if it exists or the end of the list, <code class="language-js">Logoot.after</code>.
      <DisplayCode path="./docs/demos/comparetodoorder.js" />
    </p>`
}}
