import DefinitionSearch from '../demos/definitionsearch.js'
import Definition from '../demos/definition.js'

export default function(graffiti) { return {
  components: { DefinitionSearch,
    Definition: Definition(graffiti)
  },

  template: `
    <h1>Moderation</h1>

    <p>
      The Graffiti server only lets you modify or destroy objects that <em>you</em> have created.
      On the surface, this appears to eliminate the possibility of what is arguably the most important feature of a social media platform: moderation.
      However, we will show how <em>any</em> moderation system can be <em>simulated</em> via different interpretations.
      If something bad exists but no one sees it, that is ok.
    </p>

    <p>
      We will use the example of a collaborative dictionary where anyone can submit a definition for a word.
      Surely some of these
    </p>

    <div class="component">
      <DefinitionSearch v-slot="def">
        <Definition :word="def.word"/>
      </DefinitionSearch>
    </div>

    <h2>
      Last Writer Wins
    </h2>

    <p>
      In a system with a lot of trust you could just use last-writer wins.
    </p>

    <h2>
      Popularity
    </h2>

    <p>
      A democratic approach would be to simply choose the most popular.
    </p>

    <h2>
      Delegation
    </h2>

    <p>
      Perhaps you have a couple people you trust, and so you want the most popular definition among a group of moderators.
      Classic "moderators".
    </p>

    <h2>
      Conclusion
    </h2>

    <p>
      A site could utilize these or any other methods, but because they are not actually modifying the data you could have any other.
      Delegations of delegations, whitelists, blacklists, word filters, etc.
    </p>

    <footer>
      <router-link to="/audit">
        Audits
      </router-link>
    </footer>`
}}
