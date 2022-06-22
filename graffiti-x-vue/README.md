# Graffiti Plugin for [Vue 3](https://vuejs.org/guide/introduction.html)

This plugin lets you write reactive social web applications in HTML that operate on top of the [Graffiti server](https://github.com/csail-graffiti/server). It exposes a single custom Vue component called `graffiti-collection` that forms a reactive collection of objects matching a particular [MongoDB query](https://www.mongodb.com/docs/manual/tutorial/query-documents/). For example, to form a collection of posts and display them in a list you could do:

```html
<graffiti-collection :query="{
  type: 'post',
  content: { $type: 'string' }
}" v-slot="posts">

  <ul>
    <li v-for="post in posts.objects" :key="post._id">
      {{ post.content }}
    </li>
  </ul>

</graffiti-collection>
```
    
As more posts are added to the server that match the query, the collection will dynamically update to include them. Collections can be included within collections; for example, to get the "likes" or comments associated with each post.

To use this plugin, you can add the following script before the closing `</body>` tag in your document:

```html
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
```

Check out working examples at the [Graffiti website](https://graffiti.csail.mit.edu) and [its source code](https://github.com/csail-graffiti/website)
    
## Modifying Content

Each collection has associated `update` and `delete` methods that can be used to modify content. For example, to create a button that adds a post with the content "hello world" to the collection above, you could do:

```html
<button @click="posts.update({
  type: 'post,
  content: 'hello world'
})">
  post!
</button>
```
    
Calling a collection's `update` method on an object that does not match the collection's query will fail. That way you won't be creating any data that you can't "see".

The `delete` method can be called on any object in the collection.
Within the `v-for` loop of the running example you could add a button that deletes a post as follows:

```html
<button @click="posts.delete(post)">
  delete this post!
</button>
```
    
Similar to updates, using a collection's `delete` method on an object not included in that collection will fail. Also, you can only delete objects that you have created.

Alternatively, the `delete` method can be called directly on an object's `_id` field (*i.e.* `posts.delete(post._id)`). The `_id` field of an object is a random and unique string allocated to each object and regulated by the server.

An object can be edited/replaced by calling `update` method on an object that already has an assigned `_id` field.
Since every object on the server has an `_id` field, all objects in the collection should already have that field.
So to create a button that adds an exclamation mark to an existing post you could do:

```html
<button @click="
  post.content += '!';
  posts.update(post);
">
  hype!
</button>
```
    
You can only replace objects that you have created and the result must match the collection's query.
    
## Logging In and Out

The plugin exposes a reactive boolean named `$graffiti.loggedIn` and two functions `$graffiti.logIn()` and `$graffiti.logOut()` that you can use to create log in/out interfaces. You do not need to be logged in for queries to work, but you do need to be logged in to modify content.

A basic interface could be created as follows:

```html
<button v-if="$graffiti.loggedIn" @click="$graffiti.logOut">
  log out
</button>
<button v-else @click="$graffiti.logIn">
  log in to graffiti!
</button>
```

## Context

A practical social application will probably generate objects that contain a lot of data and metadata. For example, suppose Max is using an application that generates the following object:

```js
{
  type: 'post',
  content: 'hello world!',
  _by: 'e4355faa-d060-5e18-ad2d-822655eb872c', // Max's user ID
  tags: ['greetings', 'salutations'],
  timestamp: '2022-10-31',
  location: 'Somerville, MA'
}
```

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

```js
{
  type: 'post',
  content: 'hello world!',
  _by: 'notmax', // ‼️ the ID is different ‼️
  tags: ['greetings', 'salutations'],
  timestamp: '2022-10-31',
  location: 'Somerville, MA'
}
```

If someone makes a query "specifically looking for posts by Max", the original object *will* match the query and the near miss object *will not* match the query so the server *will* send the querier Max's post. But if someone makes a different query like "posts made in Somerville, MA", then both the original object *and* the near miss *will* match the query. In that case the server *will not* send the querier Max's post.

In many practical cases just using near misses will be enough. But in some instances it is useful to specify "neighbors" (the opposite of near misses; the object will only be returned if its neighbors also match the query) or multiple sets of near misses and neighbors (the object will be returned if it matches the query and *any* of the sets of near misses and neighbors complies with with the query).
Using these you can effectively create any Boolean expression via its [disjunctive normal form](https://en.wikipedia.org/wiki/Disjunctive_normal_form).

### Context Syntax

Near misses and neighbors will inevitably be very similar to the object they're annotating, so it doesn't make sense to have to write them out entirely.
Therefore this plugin allows you to describe them as functional transformations of the source object. Using [arrow/lambda function notation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions) the near miss listed above can be described simply with the function `o=> o._by = 'notmax'`.
Putting it all together, Max's code might look as follows:

```html
<button @click="posts.update({
  type: 'post',
  content: 'hello world!',
  _by: 'e4355faa-d060-5e18-ad2d-822655eb872c',
  tags: ['greetings', 'salutations'],
  timestamp: '2022-10-31',
  location: 'Somerville, MA',
  _nearMisses: [ o=> o._by = 'notmax' ]
})">
  say 'hello world' to my followers!
</button>
```

Here's a more advanced example to puzzle through that takes advantage of the complete disjuntive normal form: the following object will show up if you query for objects that include the tags `live`, `laugh`, *and* `love` (`{tags: { $all: ['live', 'laugh', 'love'] }`) or if you query for objects that include the tags `live`, `laugh`, *or* `love` (`{ tags: $elemMatch: { '$in': ['live', 'laugh', 'love'] } }`) but it will *not* show up if you query for any subsets of the trio.

```js
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
      o=> o.tags = ['live'],
      o=> o.tags = ['laugh'],
      o=> o.tags = ['love'],
    ],
    _nearMisses: [
      o=> o.tags = ['learn']
    ]
  }]
}
```

## Identity

When you are logged in, the global variable `$graffiti.myID` will be equal to a constant identifier linked to your account.
You can use this ID to prove ownership and enforce privacy.

### Ownership

You can set your ID and *only* your ID as the value of the `_by` field in any objects you create.
In other words, this is a spcial field that no one else can forge.

```js
{
  content: 'something definitely by me',
  _by: $graffiti.myID
}
```
    
For crypto folks, you can think of this as signing a message with your public key.
Hopefully one day the Graffiti system will be decentralized and end-to-end encrypted and this will actually be a cryptographic signature.

This plugin makes the assumption that more often than not you'll want to add your ID to the `_by` field, so it's added automatically (yay, less writing!)
But if for some reason you want to create anonymous objects just pass an `anonymous` flag to the update function:

```js
posts.update({
  content: 'who could this be by?'
}, anonymous=true)
```
    
We've also made the assumption that more often than not you'll only want to *query* for objects that include a valid `_by` field. So any query you make is automatically rewritten to require it.
If you want to see anonymous messages as well, mark the `allowAnonymous` flag:
    
```html
<graffiti-collection :query="{
  content: { $type: 'string' }
}" v-slot="allContent"
allowAnonymous="true">
  ...
</graffiti-collection>
```

### Private Objects

In addition to the `_by` field, there is also a special `_to` field.
If you include the `_to` field in an object, it must be an array of user IDs.
But what really makes this field special is that you can only query for objects `_to` yourself:

```html
<graffiti-collection :query="{
  _to: $graffiti.myID
}" v-slot="myInbox">
  ...
</graffiti-collection>
```

On its own, this restriction doesn't make objects private, it just limits how they can be found.
But by combining it with context rules, we can make completely private objects:

```js
{
  content: 'my secret message'
  _to: ['e4355faa-d060-5e18-ad2d-822655eb872c'] // recipient's ID
  _nearMisses: [ o=> o._to = 'anyone else' ]
}
```
    
Defining privacy in this way allows for freedom to make objects "semi-private". You could create an object that certain recipients may view as a "direct message" (by querying for objects directly `_to` themselves) but others will only see in the appropriate context. You can use this sort of interaction to alert users that you're tagging them in a reply while for everyone else the comment stays in the context of the thread:

```js
{
  inReplyTo: 'something cool',
  content: 'wow, @Max would love this',
  _to: ['e4355faa-d060-5e18-ad2d-822655eb872c'],
  _contexts: [{
    _nearMisses: [ o=> o.inReplyTo = 'something not cool' ]
  }, {
    _nearMisses: [ o=> o._to = 'anyone else' ]
  }]
}
```

## Sorting Collections

You can change how collections are ordered by assigning a different `value-function`.
This function takes an object in the collection and outputs a value for it.
When you iterate over the collection, the objects will be sorted from the highest to lowest value.
For example, to sort a collection of movies:

```html
<graffiti-collection v-slot="movies" :query="{
  type: 'movie',
  title: { $type: 'string' }
  rating: { $type: 'number' }
}" :value-function="movie=> movie.rating">

  Movies from best to worst:
  <ul>
    <li v-for="movie in movies.objects" :key="movie._id">
      {{ movie.title }}
    <li>
  </ul>
</graffiti-collection>
```

### Timestamps

By default, collections are sorted by the field `timestamp`, *i.e.* the value function is `o=> o.timestamp`.
So like with identity, we assume it most cases you will want to add a `timestamp` field to all objects you create and only query for objects that are timestamped.
To disable this default functionality you can add a `timestamp=false` flag to your update requests and an `allowNoTimestamps=true` flag to your collection queries.

### Sorting by Child Collections

The only input to the value function is an object, but what if you want to sort according to features of child collections?
For example, how could you sort a collection of posts by the number of likes each post has?

In Vue, data tends to [flow one way](https://vuejs.org/guide/components/props.html#one-way-data-flow): from parent nodes to children.
To get data to move in the opposite direction we're going to have to use [events](https://vuejs.org/guide/essentials/event-handling.html).
This plugin exposes an event called `modify` which is called by a collection whenever the collection changes.
A collection's `objects` are passed as an argument to the event to use in computation.

The `modify` event lets us pass data up, but we're still going to need somewhere to put that data.
This plugin gives each object in a collection a special field simply called `_`.
You can use this field to store arbitrary local data; anything you put in this field will ignored by `update`.

Putting this all together, we can sort a list of posts by the number of likes each post has as follows:

```html
<graffiti-collection v-slot="posts" :query="{
  type: 'post',
  content: { $type: 'string' }
}" :value-function="post=> post._.numLikes">

  <ul>
    <li v-for="post in posts.objects" :key="post._id">

      <graffiti-collection v-slot="likes" :query="{
        type: 'like',
        at: post._id,
      }" @modify="objects=> post._.numLikes = objects.length">
      </graffiti-collection>

      "{{post.content}}" has {{post._.numLikes}} likes.

    </li>
  </ul>
</graffiti-collection>
```

## Shorthand Functions

Here are some global functions we've made to capture some common patterns:

### `byMe`

This global variable is equivalent to the function `object=> object._by == $graffiti.myID`.
You might use this to conditionally add edit or delete buttons to objects you've created, since you can only modify your own objects. For example:

```html
<template v-if="$graffiti.byMe(post)">
  <button @click="posts.delete(post)">
    delete my post
  </button>
</template>
```

You can also use [filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter) to get all of the objects in a collection that are yours. You might use this to add controls to delete your own objects from a collection:

```html
<button @click="likes.delete(
  likes.objects.filter($graffiti.byMe)[0]
)">
  unlike
</button>
```

### `getAuthors`

This global variable takes in an array of objects and outputs a list of all the authors who created those objects without duplicates.
If you want a system that enforces "one person one vote/like" you can use this function to remove duplicates from your count:

```html
<graffiti-collection v-slot="likes" :query="{
  type: 'like',
  at: post._id,
}" @modify="objects=> 
  post._.numLikes = $graffiti.getAuthors(objects).length">
</graffiti-collection>
```

## Initialization

As mentioned in the introduction you can use this library by including the following module at the end of your HTML document:

```js
import { createApp } from "https://unpkg.com/vue@3.2.36/dist/vue.esm-browser.prod.js"
import Graffiti from "https://csail-graffiti.github.io/vue/plugin.js"

Graffiti().then(g=>createApp().use(g).mount("#app"))
```

To unpack that last line, we are first initializing the Graffiti library by calling `Graffiti()`.
This connects to the server and returns a promise that resolves to a [Vue plugin](https://vuejs.org/guide/reusability/plugins.html).
By default the library will connect to the server at `https://graffiti.csail.mit.edu` but you can pass another server as an argument. For local testing you might use

```js
Graffiti('http://localhost:5000`)
```

Once the server connects and the promise resolves, the code within `then` initializes a Vue application, installs the plugin with `use` and mounts the app in the element `#app`.
You can optionally define a lot of additional functionality when you initialize Vue.
For example, to initialize a reactive state variable named `counter` you could do

```js
Graffiti().then(g=> createApp({
  data(): {
    return {
      counter: 0
    }
  }
}).use(g).mount("#app"))
```

See the [Vue documentation](https://vuejs.org/guide/introduction.html) for defining methods, reactive computation and more.

### Automatic Mounting for Live Coding

Sometimes it can be useful to automatically mount Graffiti/Vue to specific elements whenever they are added to the DOM - especially if you want to do any sort of live coding.
This library defines a [custom web component](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements) specifically for that purpose.
Once you call `registerGraffitiApp`, all existing or future elements with the custom tag `<graffiti-app>` will automatically become Graffiti/Vue applications.

```html
<graffiti-app>
  ...
</graffiti-app>

<script type="module">
  import { createApp } from "https://unpkg.com/vue@3.2.36/dist/vue.esm-browser.prod.js"
  import { default as Graffiti, registerGraffitiApp } from "../vue/plugin.js"

  Graffiti().then(g=>registerGraffitiApp(g, createApp))
</script>
```
