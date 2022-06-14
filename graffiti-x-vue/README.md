# Graffiti Plugin for [Vue 3](https://vuejs.org/guide/introduction.html)

This plugin lets you write reactive social web applications in HTML that operate on top of the [Graffiti server](https://github.com/csail-graffiti/server). It exposes a single custom Vue component called `graffiti-collection` that forms a reactive collection of objects matching a particular query. For example, to form a collection of posts and display them in a list you could do:

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

You can use this plugin by adding a small script before the closing `</body>` tag in your document:
    
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
    })">post!</button>
    
Calling a collection's `update` method on an object that does not match the collection's query will fail. That way you won't be creating any data that you can't "see".

The `delete` method can be called on any object in the collection.
Within the `v-for` loop of the running example you could add a button that deletes a post as follows:

    <button @click="posts.delete(post)">
      delete this post!
    </button>
    
Similar to updates, using a collection's `delete` method on an object not included in that collection will fail. You can also only delete objects that you have created.
You can also call the `delete` method directly on an object's `_id` field (*.i.e.* `posts.delete(post._id)`). The `_id` field of an object is a unique string allocated to each object and regulated by the server.

An object can be edited/replaced by calling `update` method on an object that already has an assigned `_id` field.
All objects in the collection should already have that field, so to create a button that adds an exclamation mark to an existing post you could do:

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

    <template v-if="$graffiti.loggedin">
      <button @click="$graffiti.logOut">log out</button>
    </template>
    <template v-else>
      <button @click="$graffiti.logIn">log in to graffiti!</button>
    </template>

## Context

### Context Shorthand

Near misses and neighbors will inherently be very similar to the original object so it doesn't make sense to have to write it all out again.
So near misses can be 

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
