import NoBoop from '../demos/noboop.js'
import Audit from '../demos/audit.js'

export default function(graffiti) { return {
  components: {
    Audit: Audit(graffiti),
    NoBoop: NoBoop(graffiti)
  },

  template: `
    <h1>Audits</h1>

    <p>
      The drawback of using a system as flexible as Graffiti's <router-link to="/context">contextual boundaries</router-link> as compared to something like a hierarchy of directories is the potential for data to get <a href="https://en.wikipedia.org/wiki/Lost_in_hyperspace">lost in hyperspace</a>.
      In a filestructure you can start at the root directory and crawl through the tree and eventually you'll touch every file.
      But in Graffiti there are some objects you won't find unless you make <em>exactly</em> the right query.
    </p>

    <p>
      This is why the <code class="language-js">update</code> and <code class="language-js">remove</code> functions are coupled to a particular collection query rather than provided as global properties.
      It makes it hard to accidentally create data you that wouldn't be able to find or destroy data that you didn't mean to.
      Below we're going to try to create boops even though we're quering for <code class="language-js">"notboops"</code>

      <display-code path="./docs/demos/noboop.js"></display-code>

      Clicking on the button will flash a boop because Graffiti performs <a href="https://stackoverflow.com/questions/33009657/what-is-optimistic-updates-in-front-end-development">optimistic rendering</a>, but the server will very quickly reject the update and the boop will be removed.
      You can open the developer console to see the error.

      <div class="component">
        <NoBoop/>
      </div>
    </p>

    <p>
      This coupling is a good protection mechanism but it is not foolproof.
      That's why you can include an <code class="language-js">_audit</code> flag in queries you pass to the <code class="language-js">useCollection</code> composable.
      This flag makes the query ignore <em>all</em> contextual boundaries but it will only query for objects <code class="language-js">_by</code> yourself.
    </p>

    <p>
      Let's use this to make a very rudimentary version of Facebook's "<a href="https://www.wikihow.com/Use-the-Facebook-Activity-Log-Page">Activity Log</a>".
      The code below queries for <em>anything</em> you have posted to Graffiti and displays a snippet of the results.

      <display-code path="./docs/demos/audit.js"></display-code>

      <div class="component">
        <Audit/>
      </div>
    </p>
  
    <footer>
      <router-link to="/ordered">
        Ordered Lists
      </router-link>
    </footer>`
}}
