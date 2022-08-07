export default function(graffiti) { return {
  template: `
    <h1>Moderation</h1>

    <p>
      At this point we've described all of the basic functionality, in the next couple of sections we're going to show how these can be combined into complex social tools.
      One thing we encountered in the last example was that we couldn't delete boops in our "outbox".
      Unlike email the data is not being, we're just reading it from a shared database.
      You can only delete things you have created.

      So we're going to see now how you can "annotate" objects.
    </p>

    <footer>
      <router-link to="/audit">
        Audits
      </router-link>
    </footer>`
}}
