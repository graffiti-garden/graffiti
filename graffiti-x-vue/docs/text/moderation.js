import DefinitionSearch from '../demos/definitionsearch.js'
import Definition from '../demos/definition.js'
import DefinitionLWW from '../demos/definitionlww.js'
import DefinitionPopular from '../demos/definitionpopular.js'

export default function(graffiti) { return {
  components: { DefinitionSearch,
    Definition: Definition(graffiti),
    DefinitionLWW: DefinitionLWW(graffiti),
    DefinitionPopular: DefinitionPopular(graffiti)
  },

  template: `
    <h1>Moderation</h1>

    <p>
      The Graffiti server only lets you modify or destroy objects that <em>you</em> have created.
      On the surface, this appears to eliminate the possibility of what is arguably the most important feature of a social media platform: moderation.
      However, we will show how <em>any</em> moderation system can be <em>simulated</em> via different interpretations of data and different filters.
      There is no global "arbiter of truth", anyone can choose for themselves what they would like to filter out and who, if anyone, should be their "moderators".
    </p>

    <p>
      In the example below we construct a collaborative dictionary where anyone can submit a definition for a word.
      Much like the platform <a href="https://www.urbandictionary.com">Urban Dictionary</a>, there will likely be definitions that are off-topic and offensive.
      We will explore three different moderation methods one might use, although they are only scratching the surface of what is possible, which we discuss at the end.
    </p>

    <p>
      To start off, we'll make a dictionary with the most extreme moderation possible: it will only show definitions that we have created.
      Try it out below and maybe add some definitions for your favorite animals.
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
      In a context where participants have lots of mutual trust and respect, you might simply use "last-writer wins" system where the most recent definition is chosen as the "right" definition.
    </p>

    <div class="component">
      <DefinitionSearch v-slot="def">
        <DefinitionLWW :word="def.word"/>
      </DefinitionSearch>
    </div>

    <h2>
      Popularity
    </h2>

    <p>
      In the actual Urban Dictionary, a democratic approach is used where the most popular definitions are displayed first.
      Below you can "like" different definitions and the one with the most likes will be displayed.
    </p>

    <div class="component">
      <DefinitionSearch v-slot="def">
        <DefinitionPopular :word="def.word"/>
      </DefinitionSearch>
    </div>

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
