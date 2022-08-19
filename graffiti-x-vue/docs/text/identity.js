import Name from '../demos/name.js'
import Comments from '../demos/comments.js'

export default function(graffiti) { return {

  setup: ()=> graffiti,

  components: {
    Name: Name(graffiti),
    Comments: Comments(graffiti),
  },

  template: `
    <h1>Identity</h1>

    <p>
      In <router-link to="/collections">§Collections</router-link>, our demo queries included the condition <code class="language-js">{_by: myID}</code>.
      <code class="language-js">_by</code> is a special property that is automatically included in all objects and must be equal to the object's creator's ID; it is an unforgable "signature" on objects.
      So far we have used
      <code class="language-js">_by</code> to filter out objects that other people reading this demo have created, but you can also use it to cross reference information about a user.
    </p>

    <p>
      In the example that follows, we create a comments section and, for each comment, display the name associated with the commenter's ID.
      First, we'll create a component for displaying and editing names:

      <div class="component">
        My name is: <Name :editable="true" :ID="myID"/>
      </div>
    </p>

    <p>
      Our "Name" component queries for a collection of <code class="language-js">names</code> that have a property <code class="language-js">name</code> and are <code class="language-js">_by</code> a particular user's ID.
      If someone has multiple names, we display the most recent name by sorting the collection in reverse chronological order using the <code class="language-js">sortBy</code> <router-link to="/collections">helper method</router-link>. 
      We've added an <code class="language-js">editable</code> parameter to the component so that the "✏️" edit icon won't appear unless we explicitly want it to.
    </p>

    <p>
      One subtle but important detail is that we are passing the query into the component as a function rather than a constant object. 
      This makes our query react to changes in the <code class="language-js">ID</code> parameter.
      You can read more about reactivity to <code class="language-js">props</code> in <code class="language-js">setup</code> <a href="https://vuejs.org/api/composition-api-setup.html#accessing-props">here</a>.

      <DisplayCode path="./docs/demos/name.js"/>
    </p>

    <p>
      Now that we can display names, we're going to create a comments section for this page.
      Our comments section will include a query for objects that have a property <code class="language-js">comment</code> and are explicitly <code class="language-js">about</code> this page's URL.
      We use our name component to cross-reference and display a name with each comment.
      If the comment is our own, we'll add a button that deletes it.

      <DisplayCode path="./docs/demos/comments.js"/>
    </p>

    <p>
      Try writing a comment below. Then, perhaps <router-link to="/logging-in">log out and log back in</router-link> with another account and write a comment under a different name.

      <div class="component">
        <Comments/>
      </div>

      This comments section is about as simple as it could be, but there are plenty of ways to extend it.
      Copying patterns from dominant platforms you could...
      <ul>
        <li>
          Display the timestamp and other metadata like tags, locations, photos, etc.
        </li>
        <li>
          Display other information about the commenter, like a profile picture.
        </li>
        <li>
          Add comments sections to each comment to create threading.
        </li>
        <li>
          Add other interactive components like a "like" button.
        </li>
      </ul>
      Of course, with Graffiti you aren't limited to to these preexisting patterns.
      What if really large comment streams could be <a href="https://dl.acm.org/doi/abs/10.1145/2998181.2998235">recursively summarized</a>?
      What sort of patterns could allow for more <a href="https://a9.io/glue-comic">nonlinear conversations</a>?
      What if the comments had some sort of spatial structure (like physical graffiti on a wall)?
    </p>

    <footer>
      <router-link to="/context">
        Context
      </router-link>
    </footer>`
}}
