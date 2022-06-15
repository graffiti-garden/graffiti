# Graffiti Plugin for [Vue 3](https://vuejs.org/guide/introduction.html)

This plugin lets you write reactive social web applications in HTML that operate on top of the [Graffiti server](https://github.com/csail-graffiti/server). It exposes a single custom Vue component called `graffiti-collection` that forms a reactive collection of objects matching a particular [MongoDB query](https://www.mongodb.com/docs/manual/tutorial/query-documents/). For example, to form a collection of posts and display them in a list you could do:

    <graffiti-collection :query="{
      type: 'post',
      content: { $type: 'string' }
    }" v-slot="posts">
      
      <ul>
        <li v-for="post in posts.objects">
          {{ post.content }}
        </li>
      </ul>
      
    </graffiti-collection>
    
As more posts are added to the server that match the query, the collection will dynamically update to include them. Collections can be included within collections; for example, to get the "likes" or comments associated with each post.

To use this plugin, you can add the following script before the closing `</body>` tag in your document:
    
    <body>
    
      <div id="app">
        <!-- your Vue app goes here -->
      </div>
      
      <script type="module">
        import { createApp } from "https://unpkg.com/vue@3.2.36/dist/vue.esm-browser.prod.js"
        import Graffiti from "https://csail-graffiti.github.io/vue/plugin.js"
        Graffiti().then(g=>createApp().use(g).mount("#app"))
      </script>
      
    </body>
    
## Modifying Content

Each collection has associated `update` and `delete` methods that can be used to modify content. For example, to create a button that adds a post with the content "hello world" to the collection above, you could do:

    <button @click="posts.update({
      type: 'post,
      content: 'hello world'
    })">
      post!
    </button>
    
Calling a collection's `update` method on an object that does not match the collection's query will fail. That way you won't be creating any data that you can't "see".

The `delete` method can be called on any object in the collection.
Within the `v-for` loop of the running example you could add a button that deletes a post as follows:

    <button @click="posts.delete(post)">
      delete this post!
    </button>
    
Similar to updates, using a collection's `delete` method on an object not included in that collection will fail. Also, you can only delete objects that you have created.

Alternatively, the `delete` method can be called directly on an object's `_id` field (*i.e.* `posts.delete(post._id)`). The `_id` field of an object is a random and unique string allocated to each object and regulated by the server.

An object can be edited/replaced by calling `update` method on an object that already has an assigned `_id` field.
Since every object on the server has an `_id` field all objects in the collection should already have that field.
So to create a button that adds an exclamation mark to an existing post you could do:

    <button @click="
      post.content += '!';
      posts.update(post);
    ">
      hype!
    </button>
    
You can only replace objects that you have created and the result must match the collection's query.
    
## Logging In and Out

The plugin exposes a reactive boolean named `$graffiti.loggedIn` and two functions `$graffiti.logIn()` and `$graffiti.logOut()` that you can use to create log in/out interfaces. You do not need to be logged in for queries to work, but you do need to be logged in to modify content.

A basic interface could be created as follows:

    <button v-if="$graffiti.loggedIn" @click="$graffiti.logOut">
      log out
    </button>
    <button v-else @click="$graffiti.logIn">
      log in to graffiti!
    </button>

## Context

A practical social application will probably generate objects that contain a lot of data and metadata. For example, suppose Max is using an application that generates the following object:

    {
      type: 'post',
      content: 'hello world!',
      _by: e4355faa-d060-5e18-ad2d-822655eb872c, // Max's user ID
      tags: ['greetings', 'salutations'],
      timestamp: '2022-10-31',
      location: 'Somerville, MA'
    }

This object will appear in queries for "posts made by Max", "posts with the tag `greetings`", "posts made on Halloween", "posts made in Somerville, MA", etc.
As a result it's hard for Max to tell who the audience of their post is. This is a problem known as "[context collapse](https://journals.sagepub.com/doi/abs/10.1177/1461444810365313)". For some people, context collapse can make them wary of posting anything that would only interest a specific sub-audience and so they post much less. Other people don't filter themselves and end up pushing some of their audience away (think of that friend who wouldn't stop posting their wordle results).

Many applications resolve this by choosing one fixed type of context for everyone - on Facebook your post will only be seen by your friends, on Reddit your post will only be seen by other members of a sub, on Yik Yak your post will only be seen by people nearby. How can we handle all of these cases at once?

In Graffiti, each individual object can specify the context or contexts in which it should appear. We consider a context to be equivalent to a statement like "I only want to people to see this object if they're specifically looking for $X$". For example:

| Specifically looking for...      | Audience                              |
| -------------------------------  | ------------------------------------- |
| posts by Max                     | Max's friends/followers               |
| posts with the tag `greetings`   | People really interested in greetings |
| posts in Somerville              | The Somerville community              |

To make these statements machine-readable, we're going to use what we call "near misses". A near miss is going to be an object that is *very close* to the object we're creating, only just different enough that we consider it to be out of context. For a given query $Q$, the server will return an object if that object matches $Q$ and its near misses *don't* match $Q$. For example, if Max wanted their post to only show up to their followers, they would annotate it with this near miss:

    {
      type: 'post',
      content: 'hello world!',
      _by: 'notmax', // ‼️ the ID is different ‼️
      tags: ['greetings', 'salutations'],
      timestamp: '2022-10-31',
      location: 'Somerville, MA'
    }

If someone makes a query "specifically looking for posts by Max", the original object *will* match the query and the near miss object *will not* match the query so the server *will* send the querier Max's post. But if someone makes a different query like "posts made in Somerville, MA", then both the original object *and* the near miss *will* match that query. In that case the server *will not* send the querier Max's post.

In most practical cases just using near misses will be enough. But in some instances it is useful to specify "neighbors" (the object will only be returned if its neighbors also match the query) or multiple sets of near misses and neighbors (the object will be returned if it matches the query and *any* of the sets of near misses and neighbors complies with with the query).
Using these you can effectively create any Boolean expression via its [disjunctive normal form](https://en.wikipedia.org/wiki/Disjunctive_normal_form).

### Context Syntax

Near misses and neighbors will inevitably be very similar to the object they're annotating, so it doesn't make sense to have to write them out entirely.
Therefore this plugin allows you to describe them as functional transformations of the source object. Using [arrow/lambda function notation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions) the near miss listed above can be described simply with the function `o=> o._by = 'notmax'`.
Putting it all together, Max's code might look as follows:

    <button @click="posts.update({
      type: 'post',
      content: 'hello world!',
      _by: e4355faa-d060-5e18-ad2d-822655eb872c,
      tags: ['greetings', 'salutations'],
      timestamp: '2022-10-31',
      location: 'Somerville, MA'
      _nearMisses: [ o=> o._by = 'notmax' ]// ‼️ "...specifically looking for posts by Max"
    })">
      say 'hello world' to my followers!
    </button>

Here's a more advanced example to puzzle through that takes advantage of the complete disjuntive normal form: the following object will show up if you query for objects that include the tags `live`, `laugh`, *and* `love` (`{tags: { $all: ['live', 'laugh', 'love'] }`) or if you query for objects that include the tags `live`, `laugh`, *or* `love` (`{ tags: $elemMatch: { '$in': ['live', 'laugh', 'love'] } }`) but it will *not* show up if you query for any subsets of the trio.

    {
      content: '~inspiration~'
      tags: ['live', 'laugh', 'love'],
      _contexts: [{
        _nearMisses: [
          o=> o.tags[0] = '!live',
          o=> o.tags[1] = '!laugh',
          o=> o.tags[2] = '!love'
        ]
      }, {
        _neighbors: [
          o=> o.tags = ['live']
          o=> o.tags = ['laugh']
          o=> o.tags = ['love']
        ],
        _nearMisses: [
          o=> o.tags = ['learn']
        ]
      }
    }

## Identity

When you are logged in, the global variable `$graffiti.myID` will be equal to a constant identifier linked to your account.
You can mark objects you've created with your ID to prove you are that object's owner and you can create private objects that can only be queried by people with specific IDs.

### Ownership

You can use your ID and *only* your ID in the value of the `_by` field in any objects you create.
I.e. noone else can forge. For crypto folks you can think of this as signing a message (hopefully one day the graffiti system will be decentralized and end-to-end encrypted and this probably *will* be a cryptographic signature).

### Private Messages

## Misc

Anonymous flag, timestamp flag, sorting example.
`$graffiti.byMe(object)`
`objects.filter($graffiti.byMe)`
`$graffiti.getAuthors(objects).length`

## Examples

For practical examples see the [Graffiti website](https://csail-graffiti.github.io/website/) and [its source code](https://github.com/csail-graffiti/website)
