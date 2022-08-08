import Booper from '../demos/boop.js'
import Context from '../demos/context.js'
import Context2 from '../demos/context2.js'

export default function(graffiti) { return {
  components: {
    Booper: Booper(graffiti),
    Context: Context(graffiti),
    Context2: Context2(graffiti)
  },

  template: `
    <h1 id="context">
      Context
    </h1>

    <p>
      <a href="https://en.wikipedia.org/wiki/Context_collapse">Contextual boundaries</a> are critical to maintaining healthy social relationships, and so one of Graffiti's core features is a powerful system for creating hard and soft contextual boundaries around data objects.
      We use "hard contextual boundaries" to describe boundaries that operate like those in a traditional <a href="https://en.wikipedia.org/wiki/Access-control_list">access control list</a>; these are boundaries where only certain whitelisted individuals are granted access to some content.
      "Soft contextual boundaries" on the other hand are for content that is public but only intended for a specific audience or audiences.
    </p>

    <p>
      To understand these soft boundaries, consider a physical analogy.
      Say you sing at a karaoke bar at the weekend.
      Your singing is technically public because anyone can walk into the bar and see you sing.
      However, anyone who sees you sing has had to chosen to walk into a karaoke bar and is presumably someone who likes karaoke and who respects the bar as a safe space for self expression.
      Also, by singing in a karaoke bar you know that your audience is implicitly <em>consenting</em> to being sung at,
      as opposed to a random street corner or your an office where it might be extremely disturbing.
    </p>

    <p>
      In Graffiti, hard contextual boundaries are actually a special case of soft contextual boundaries, so we will start with soft.
      We specify a soft contextual boundary to be something of the form "I don't want people to see <i>X</i> unless they are specifically looking for <i>Y</i>", for example "I don't want people to see <i>me sing</i> unless they are specifically looking for <i>karaoke</i>".
    </p>

    <p>
      We formally say that a query is "specifically looking for <i>Y</i> in <i>X</i>" if that query would <em>fail</em> on <i>X</i> if <i>Y</i> were changed.
      For example, the request "show me someone singing" could be answered with either someone singing in a karaoke bar or someone singing on a street corner — the query does not fail if "karaoke bar" is changed to "street corner" and so the request is not sufficiently specific.
      Whereas, the request "show me someone singing in a karaoke bar" could not be answered with someone singing on a street corner — the query fails if "karaoke bar" is changed to "street corner" and so this request is sufficiently specific.
    </p>

    <p>
      In the example below we are going make two buttons that create boops with the tag <code class="language-js">"demo"</code>.
      Remember,
      <code class="language-js">tags</code>, like
      <code class="language-js">type</code> and all other properties not beginning with
      <code class="language-js">_</code>, is just an arbitrary property name.
      Boops created with one button will not not specify any contextual boundaries.
      Boops created with the other button will use two special properties,
      <code class="language-js">_inContextIf</code> and
      <code class="language-js">_queryFailsWithout</code>,
      to add a boundary that only shows these boops to people <em>specifcally</em> looking for objects with the tag <code class="language-js">"demo"</code>.

      <display-code path="./docs/demos/context.js"></display-code>
    </p>

    <p>
      Here is an instantiation of the component, plus the component we built in the <router-link to="/collections">§Collections</router-link>.
      Check out what happens when you press each of the buttons.
      <div class="component">
        <Context/>
        <Booper/>
      </div>
    </p>

    <p>
      The array <code class="language-js">_inContextIf</code> can include multiple conditions and an object will be "in context" if any one of the conditions holds.
      The array <code class="language-js">_queryFailsWithout</code> can include multiple properties and an object will be in context if the query fails without any one of them.
      It can also include groups of properties and an object will be in context if removing all of the properties in the group simultaneously causes the query to fail.
      And finally, in addition to <code class="language-js">_queryFailsWithout</code> you can also use it's negation,
      <code class="language-js">_queryPassesWithout</code>.
    </p>

    <p>
      With these elements you can construct arbitrary boolean "context formulas" —
      perhaps it's easier to understand by playing with an example.
      Below we have an object that is in context if someone queries for
      objects that are (boops AND tagged with "demo") OR (boops OR tagged with demo).

      <display-code path="./docs/demos/context2.js"></display-code>
    </p>

    <p>
      Check out how the context in this example differs from the previous two:
      <div class="component">
        <Context2/>
        <Context/>
        <Booper/>
      </div>
    </p>

    <footer>
      <router-link to="/identity">
        Identity
      </router-link>
    </footer>`
}}
