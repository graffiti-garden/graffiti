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
      The biggest drawback that Graffiti's contexual boundaries has when compared to something like a hierarchy of directories is the potential for data to get <a href="https://en.wikipedia.org/wiki/Lost_in_hyperspace">lost in hyperspace</a>.
      In a filestructure you can start at the root directory and crawl through the tree and eventually you'll touch every file.
      But in Graffiti there are some objects you won't find unless you make <em>exactly</em> the right query.
    </p>

    <p>
      This is why the <code class="language-js">update</code> and <code class="language-js">remove</code> functions are coupled to a particular collection query rather than provided as global properties.
      It makes it hard to accidentally create data you that wouldn't be able to find or destroy data that you didn't mean to.
      See what happens when we try to create boops when we're querying for "notboops" (open the developer console to see the error):

      <display-code path="./docs/demos/noboop.js"></display-code>

      <div class="component">
        <NoBoop/>
      </div>
    </p>

    <p>
      This works as a good protection mechanism but it's not foolproof.
      That's why the <code class="language-js">useCollection</code> composable has an <code class="language-js">audit</code> flag.
      This flag makes the query ignore <em>all</em> contextual boundaries but it will only query for objects <code class="language-js">_by</code> yourself.
      You can use it to make something kind of like Facebook's "<a href="https://www.wikihow.com/Use-the-Facebook-Activity-Log-Page">Activity Log</a>" which compiles actions that have happened anywhere on the site into one stream.

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
