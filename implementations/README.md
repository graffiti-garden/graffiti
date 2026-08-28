# Graffiti Implementations

The [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html) intentionally abstracts away implementation complexities like data storage and synchronization.
This makes it possible for people to build Graffiti apps without knowing anything about the underlying architecture.
The abstraction *also* makes it possible to swap out very different implementations of the API without breaking the [apps](../examples/), [wrappers](../wrappers/), and [plugins](../plugins/) that build on top it, which is important for Graffiti's long-term sustainability.

Currently there are two implementations:
- The [local implementation](./local) is a simple implementation of the API that can be used test and develop Graffiti apps in isolation without polluting a real server with test data.
- The [decentralized implementation](./decentralized) describes a client-server protocol so that clients can retrieve data from multiple generic Graffiti servers, allowing users to store and serve their data from the server of their choice.

In the future, new implementations may explore other architectures like peer-to-peer.
