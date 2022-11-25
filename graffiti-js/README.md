# Graffiti for Vanilla Javascript

This is the base Javascript library that interfaces with the [Graffiti server](https://github.com/graffiti-garden/server).
We recommend not using this vanilla library itself but instead using framework plugins that are built on top of it like the [Graffiti plugin for Vue.JS](https://github.com/graffiti-garden/graffiti-x-vue).

If you create a [local Graffiti instance](https://github.com/graffiti-garden/server#local-usage) and a local webserver in this directory (*e.g.* `python3 -m http.server`) and navigate to `test.html` (*e.g.* [http://localhost:8000/test.html](http://localhost:8000/test.html)) you should be able to log in and test each of the Graffiti primitives: `subscribe`, `unsubscribe`, `update`, `remove`. These primitives will be robust to spamming and network interruptions.
