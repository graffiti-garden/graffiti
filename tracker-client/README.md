# Graffiti Tracker

This client javascript library interacts with the 
[tracker server](https://github.com/graffiti-garden/tracker-server/).

## Usage

First, install the client into your project with:

```bash
npm install @graffiti-garden/tracker-client
```

To connect to the client you need a "peer proof" and a list of tracker URIs.

Your peer ID is the *hash* of your peer proof - connecting via the proof rather than the hash itself prevents basic peer forgery.
The peer proof must be a 256 bit random hex string.

If no tracker list is included, the client will automatically connect to the global tracker at [wss://tracker.graffiti.garden]().

```js
import TrackerClient from @graffiti-garden/tracker-client

// Generate the peer proof
const peerProof =
 [...crypto.getRandomValues(new Uint8Array(32))]
 .map(b => b.toString(16).padStart(2, '0')).join('');

// List of trackers
const myTrackers = ['ws://localhost:8000', 'wss://tracker.my.website']

const trackerClient = new TrackerClient(peerProof, myTrackers)
```

To announce or unannounce, simply pass a list of URIs into the appropriate function:

```js
await trackerClient.announce(
  'urn:fdc:example.com',
  'urn:isan:0000-0000-2CEA-0000-1-0000-0000-Y'
)

const myURIs = [
  'urn:uuid:6e8bc430-9c3a-11d9-9669-0800200c9a66',
  'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
]
await trackerClient.unannounce(...myURIs)
```

Subscription is done with an asyncronous generator.
Like, [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch),
it uses an [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) to stop running requests.

For example, to timeout after 5 seconds:

```js
const signal = AbortSignal.timeout(5000) 

for await (const { action, peer } in trackerClient.subscribe('uri:fdc:graffiti.garden', signal)) {
  if (action == 'announce') {
    // Do something
  } else if (action == 'unannounce') {
    // Do something else
  }
}
```

## Testing

The tests will connect to the global server at [wss://tracker.graffiti.garden]() as well as a local server at [ws://localhost:8000]().
To start the local server, clone the [tracker server](https://github.com/graffiti-garden/tracker-server/) and start it with docker compose.

```bash
git clone https://github.com/graffiti-garden/tracker-server/
cd tracker-server
sudo docker compose up --build
```

You can verify the server is up by going navigating to [http://localhost:8000/]().

Then, to start the client tests simply run:

```bash
npm test
```