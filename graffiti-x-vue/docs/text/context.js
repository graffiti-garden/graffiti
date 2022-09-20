import Nickname from '../demos/nickname.js'
import Name from '../demos/name.js'

export default function(graffiti) { return {
  components: {
    Nickname: Nickname(graffiti),
    Name: Name(graffiti)
  },

  setup: ()=> graffiti,

  template: `
    <h1 id="context">
      Context
    </h1>

    <p>
      <a href="https://en.wikipedia.org/wiki/Context_collapse">Contextual boundaries</a> are critical to maintaining healthy social relationships, and so one of Graffiti's core features is a system for creating contextual boundaries around data objects.
      Some of these boundaries may function like traditional <a href="https://en.wikipedia.org/wiki/Access-control_list">access control lists</a>, which we'll get to in the <router-link to="/access">next section</router-link>.
      However, one of the most powerful things about Graffiti is its ability create softer contextual boundaries around data that is technically public but only intended for a specific audience.
    </p>

    <p>
      Perhaps you're in a punk band and perform in a public venue on the weekend.
      Although the venue is public, the only people that will experience the performance are people who presumably <em>chose</em> to enter that venue.
      So long as the venue has sufficient indicators, either by explicitly advertising "Punk Show Tonight!" or by catering to a punk aesthetic, any observer is implicitly <em>consenting</em> to hearing loud and agressive music as opposed to,
      say, people in an office space who might consider it extremely disturbing.
    </p>

    <p>
      Essentially, observers reveal some information about what they are <em>comfortable</em> and <em>interested</em> in observering via where they decide to look.
      In Graffiti, you can condition whether data objects should appear based on such information.
      This saves the observer from being overwhelmed by content they weren't expecting and saves the producer from the embarassment of "oversharing" or being misunderstood.
    </p>

    <p>
      In the example below, we will create a component that allows you to create a nickname.
      Even though the nickname will match the schema of the name component we created in the <router-link to="/identity">§Identity</router-link>,
      the interface provides an option to include the special <code class="language-js">_inContextIf</code> property with a <code class="language-js">_queryFailsWithout</code> condition. When this condition is applied, the nickname will only be shown to observers that are <em>specifically</em> looking for names related to the tag <code class="language-js">"graffiti-demo"</code>.
      Or equivalently, observers must make queries that would fail to return the nickname if the tag <code class="language-js">"graffiti-demo"</code> were changed to something random.

      <display-code path="./docs/demos/nickname.js"></display-code>
    </p>

    <p>
      Here is the component, plus the name component we made in <router-link to="/identity">§Identity</router-link>.
      Observe that when you apply the contextual boundary to the nickname, the name component will not "see" it because it is not making a specific enough query.

      <div class="component">
        <Nickname/>
        <p>
          My name is: <Name :ID="myID"/>
        </p>
      </div>
    </p>

    <h2>
      Advanced Context
    </h2>

    <p>
      Complex expression can be built within the <code class="language-js">_inContextIf</code> property to shape the contextual boundaries:

      <ul>
        <li>
          <code class="language-js">_inContextIf</code> may hold an array of possible conditions and an object will be in context if any one of the conditions evaluates to true.
        </li>
        <li>
          <code class="language-js">_queryFailsWithout</code> may describe multiple mutations and an object will only be in context if, for each mutation, applying that mutation causes the observing query to fail.
        </li>
        <li>
          In addition to <code class="language-js">_queryFailsWithout</code> you can also use it's negation, <code class="language-js">_queryPassesWithout</code>
        </li>
        <li>
          Mutations can distort a single property, as in the example above, or they may distort an array of properties.
        </li>
      </ul>
    </p>

    <p>
      In pseudocode this looks like:

      <DisplayCode path="./docs/demos/pseudocode.py" />

      Note that actually implimenting context like this would be extremely innefficient. You can see how the server actually does it <a href="https://github.com/digital-graffiti/server/blob/main/app/rewrite.py">here</a>.
    </p>


    <footer>
      <router-link to="/access">
        Access Control
      </router-link>
    </footer>`
}}
