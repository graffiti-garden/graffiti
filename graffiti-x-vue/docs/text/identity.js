import Introduction from '../demos/introduction.js'
import PrivateTODO from '../demos/privatetodos.js'

export default function(graffiti) { return {
  components: {
    Introduction: Introduction(graffiti),
    PrivateTODO: PrivateTODO(graffiti)
  },

  template: `
    <h1>Identity</h1>

    <p>
      In <router-link to="/collections">§Collections</router-link> and <router-link to="/context">§Context</router-link>, our demo queries have included the condition <code class="language-js">{_by: myID}</code>.
      <code class="language-js">_by</code> is a special property that is automatically included in all objects and must be equal to the object's creator's ID; it is an unforgable "signature" on objects.
      So far we have used
      <code class="language-js">_by</code> to filter out objects that other people reading this demo have created, but you can also use it to cross reference information about a user. For example, as your interface is parsing a list of comments, it could use <code class="language-js">_by</code> to look up and append the commenter's name to each comment.
      However, thanks to Graffiti's system of contextual boundaries, this does not mean that you can simply find everything that a user has ever posted with a single <code class="language-js">{_by: myID}</code> query.
    </p>

    <p>
      There is one other special identity property, <code class="language-js">_to</code>, which we can use to create the "hard contextual boundaries" described in <router-link to="/context">§Context</router-link>.
      The property <code class="language-js">_to</code> can optionally be included in any object and must be an array of user IDs.
      However, the primary constraint on <code class="language-js">_to</code> is on the querier's end: people can only query for objects <code class="language-js">_to</code> themselves.
    </p>

    <p>
      On it's own this does not create privacy, it just means that the recipients included in the <code class="language-js">_to</code> array of an object can query for that object in more ways than other people.
      However, by using <code class="language-js">_inContextIf</code> we can block all of the queries that <em>don't specify</em> <code class="language-js">_to</code>, thereby allowing only the desired recipients to access the object. This is how we can create private messages.
    </p>

    <p>
      In the example below we're just going to send private messages to ourself. Creating a private message to someone else is no different, but it would require three accounts (sender, receiver, snooper) rather than just two (sender, snooper) to demonstrate that it is working. We will use our private messages to represent a to-do list, which we'll sort in reverse chronological order.
      Try it out first before we explain how it works:
      <div class="component">
        <PrivateTODO/>
      </div>
    </p>

    <p>
      To make our private to-do list, first, we create a query for to-dos with timestamps. Then, we have a function that reads from a textbox and creates a to-do that can only be retrieved if the querier specifies <code class="language-js">{_to: myID}</code>. Then, we create a <a href="https://vuejs.org/guide/essentials/computed.html">computed property</a> that sorts our to-dos in reverse  chronological order. 
      Finally, we put our form and list of to-dos together.

      <DisplayCode path="./docs/demos/privatetodos.js"/>
    </p>

    <p>
      Let's make sure that noone else can snoop for our to-dos.
      We're going to create a "snooping" component that takes an ID as input and displays that to-dos it has found by that account.

      <display-code path="./docs/demos/snooper.js"></display-code>
    </p>

    <p>
      To make our Snooper work we're going to wrap it in a component that let's you introduce yourself! We'll describe that below but the result is here. Try introducing yourself then <router-link to="/logging-in">log in</router-link> with a different account and try to snoop on your first account.
      You shouldn't be able to find anything. In fact, if you check the browser console you'll see an error complaining about trying to query for objects _to someone else.

      <div class="component">
        <Introduction/>
      </div>
    </p>

    <p>
      <display-code path="./docs/demos/introduction.js"></display-code>
    </p>

    <footer>
      <router-link to="/moderation">
        Moderation
      </router-link>
    </footer>`
}}
