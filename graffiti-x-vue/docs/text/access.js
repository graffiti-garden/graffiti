import NameSnooper from '../demos/namesnooper.js'
import PrivateTODO from '../demos/privatetodos.js'

export default function(graffiti) { return {

  setup: ()=> graffiti,

  components: {
    NameSnooper: NameSnooper(graffiti),
    PrivateTODO: PrivateTODO(graffiti)
  },

  template: `
    <h1>Access Control</h1>

    <p>
      The boundaries we described in <router-link to="/context">§Context</router-link> can prevent people from stumbling upon data they weren't supposed to see or wouldn't want to see.
      However, they don't prevent malicious behavior, like stalking or spying.
      To create secure boundaries around objects, we can use the property <code class="language-js">_to</code>.
      This property can optionally be included in any object and must be an array of user IDs.
      However, the primary constraint on <code class="language-js">_to</code> is on the querier's end: people can only query for objects <code class="language-js">_to</code> themselves.
    </p>

    <p>
      On it's own this does not create privacy, it just means that the recipients included in the <code class="language-js">_to</code> array of an object can query for that object in more ways than other people.
      However, by using <code class="language-js">_inContextIf</code> we can block all of the queries that <em>don't specify</em> <code class="language-js">_to</code>, thereby allowing <em>only</em> the desired recipients to access the object.
      Using <code class="language-js">_inContextIf</code> to enforce these privacy constraints gives us the flexibility to create contexts within private spaces and to create objects that exist both in a specific public context and in a private context — imagine a comment that appears in a particular thread but also appears in the "inbox" of the person being replied to.
    </p>

    <p>
      In the example below, you're going to send private messages to yourself. Creating a private message to someone else is no different, but it would require three accounts (sender, receiver, snooper) rather than just two (sender, snooper) to demonstrate that it is working. We will use our private messages to represent a private to-do list.
      Try it out first before we explain how it works:
      <div class="component">
        <PrivateTODO/>
      </div>
    </p>

    <p>
      The code for this to-do list should look pretty similar to the code for the comments section in <router-link to="/identity">§Identity</router-link>, only this time we're specifying context around the <code class="language-js">_to</code> field.

      <DisplayCode path="./docs/demos/privatetodos.js"/>
    </p>

    <h2>
      Verifying Privacy
    </h2>

    <p>
      You could take our word that the example above makes a private to-do list,
      but let's test it just to make sure.
      We're going to create a "Snooper" component that takes an ID as input and displays the to-dos it has found by that account.
      If the to-dos are really private, you should only be able to snoop for to-dos created by your own account.

      <display-code path="./docs/demos/snooper.js"></display-code>
    </p>

    <p>
      To make our Snooper work, we're going to need to give it another user's ID.
      To do that, we'll make a component that displays public names, like those created in the <router-link to="/identity">§Identity</router-link> demo.
    </p>

    <p>
      Add some items to your to-do list then
      then <router-link to="/logging-in">log in</router-link> with a different account and try to snoop on your first account.
      If we did things right, you shouldn't be able to find anything.
      In fact, if you check the browser console you'll see an error complaining about trying to query for objects <code class="language-js">_to</code> someone else.

      <div class="component">
        <NameSnooper/>
      </div>
     
      <display-code path="./docs/demos/namesnooper.js"></display-code>
    </p>

    <footer>
      <router-link to="/moderation">
        Moderation
      </router-link>
    </footer>`
}}
