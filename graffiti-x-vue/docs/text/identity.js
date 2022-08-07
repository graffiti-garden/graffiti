import Introduction from '../demos/introduction.js'

export default function(graffiti) { return {
  components: {
    Introduction: Introduction(graffiti)
  },

  template: `
    <h1>Identity</h1>

    <p>
      In our examples, our queries have included the condition <code class="language-js">{_by: myID}</code>.
      <code class="language-js">_by</code> is a special property that is automatically included in all objects and must be equal to the object's creator's ID; it is an unforgable "signature" on objects.
      In our sections on <router-link to="/collections">Collections</router-link> and <router-link to="/context">Context</router-link>, we've been using <code class="language-js">_by</code> to filter out objects that other people reading this demo have created, but you can also use it to cross reference information about a user. For example, as your interface is parsing a list of comments, it could use <code class="language-js">_by</code> to look up and append the commenter's name to each comment.
      However, thanks to Graffiti's system of contextual boundaries, this does not mean that you can simply find everything that a user has ever posted with a single <code class="language-js">{_by: myID}</code> query.
    </p>

    <p>
      There is one other special identity property, <code class="language-js">_to</code>, which we can use to create the "hard contextual boundaries" described in the <router-link to="/context">previous section on context</router-link>.
      The property <code class="language-js">_to</code> can optionally be included in any object and must be an array of user IDs.
      However, the primary constraint on <code class="language-js">_to</code> is on the querier's end: people can only query for objects <code class="language-js">_to</code> themselves.
    </p>

    <p>
      On it's own this does not create privacy, it just means that the recipients included in the <code class="language-js">_to</code> array of an object can query for that object in more ways than other people.
      However, by using <code class="language-js">_inContextIf</code> we can block all of the queries that <em>don't specify</em> <code class="language-js">_to</code>, thereby allowing only the desired recipients to access the object.
      <!--Since this is primarily coming from _to, we can include.-->
      <!--Because context is flexible you can have an object that can be privately accessed. You might use this if you want to post a reply in a specific community but also directly "notify" whoever it is you are replying to.-->
    </p>

    <p>
      Let's see how this works in practice. First we're going to create a "Boop Outbox" which, for a given recipient ID, provides a button that sends private boops to that recipient.

      <display-code path="./docs/demos/outbox.js"></display-code>
    </p>

    <p>
      Let's also create an inbox that can read private boops from a particular sender.
      <display-code path="./docs/demos/inbox.js"></display-code>
    </p>

    <p>
      Finally, we need a way of finding people to send our boops to!
      In the code below we create component that let's use introduce yourself with a new sort of "introduction" object.
      We create a form that posts an introduction and we also display all the introductions that have been made in the past day.
      Clicking on a particular introduction will instantiate a boop inbox and outbox directed to the introduction's creator!
      <display-code path="./docs/demos/introduction.js"></display-code>
    </p>

    <p>
      Try it out! Maybe convince a friend to do this with you or open a private tab and log in with a different email.

      <div class="component">
        <Introduction/>
      </div>
    </p>

    <footer>
      <router-link to="/moderation">
        Moderation
      </router-link>
    </footer>`
}}
