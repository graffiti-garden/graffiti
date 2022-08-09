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
      However, by using <code class="language-js">_inContextIf</code> we can block all of the queries that <em>don't specify</em> <code class="language-js">_to</code>, thereby allowing <em>only</em> the desired recipients to access the object. This is how we can create private messages.
    </p>

    <p>
      In the example below you're going to send private messages to yourself. Creating a private message to someone else is no different, but it would require three accounts (sender, receiver, snooper) rather than just two (sender, snooper) to demonstrate that it is working. We will use our private messages to represent a private to-do list.
      Try it out first before we explain how it works:
      <div class="component">
        <PrivateTODO/>
      </div>
    </p>

    <p>
      Our code to make this to-do list should look pretty similar to code in <router-link to="/content">§Context</router-link>, only this time we're specifying context around the <code class="language-js">_to</code> field.
      We are also sorting our to-do list in reverse chronological order using a <a href="https://vuejs.org/guide/essentials/computed.html">computed property</a>.

      <DisplayCode path="./docs/demos/privatetodos.js"/>
    </p>

    <h2>
      Verifying Privacy
    </h2>

    <p>
      You could take our word that the example above makes a private to-do list,
      but let's test it just to make sure.
      We're going to create a "Snooper" component that takes an ID as input and displays the to-dos it has found by that account.
      If our to-dos our really private, we should only be able to snoop for to-dos created by our own account.

      <display-code path="./docs/demos/snooper.js"></display-code>
    </p>

    <p>
      To make our Snooper work, we're going to need to give it another user's ID.
      To do that, we'll make a component that let's you introduce yourself and for each introduction we'll add a "snoop" button.
      The introduction component doesn't include any new concepts so we'll show you the result first and then put its code below for completeness.
    </p>

    <p>
      Use this component to introduce yourself, then <router-link to="/logging-in">log in</router-link> with a different account and try to snoop on your first account.
      If we did things right, you shouldn't be able to find anything. In fact, if you check the browser console you'll see an error complaining about trying to query for objects <code class="language-js">_to</code> someone else.

      <div class="component">
        <Introduction/>
      </div>
    </p>

    <p>
      The introducer queries for introductions made in the past day. If you've already made an introduction, the <code class="language-js">introduceMyself</code> function replaces your old introduction, otherwise it creates a new one.
      The introductions are sorted by time and include a button that opens up a Snooper.
     
      <display-code path="./docs/demos/introduction.js"></display-code>
    </p>

    <footer>
      <router-link to="/moderation">
        Moderation
      </router-link>
    </footer>`
}}
