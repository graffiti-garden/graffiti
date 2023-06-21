# Tracker

This library operates like a [websocket bittorrent tracker](https://github.com/webtorrent/bittorrent-tracker) with some changes:
- Rather than sending batched announcements, this tracker pushes individual peer changes as they occur. This reduces traffic when peers are subscribed to many hashes with relatively static peers.
- Announcement and subscription are separated. This reduces traffic when peers are seeding vastly more data than they are leeching.

The docker compose file also launches a [PeerJS server](https://github.com/peers/peerjs-server) instance to allow peers to connect after finding each other via the tracker.
The tracker is served at `tracker.DOMAIN` and PeerJS at `peerjs.DOMAIN`.

## API

### Establishing Connection

When the client first connects to the websocket, it must send a random string: 64 lowercase letters or numbers.
The tracker will reply with the sha256 hash of that string.
The hash will be the peer's ID and this ID is what is shared to other peers in the network that are tracking the same object.
By using a hash, no peer can impersonate any other.

### Communication

After the connection has been established, the client may send JSON messages consisting of a random message ID, an action string, and an array of one or more [info hashes](https://www.bittorrent.org/beps/bep_0052.html#infohash):

```js
{
    messageID: 'a sha256 hash',
    action: 'an action',
    infoHashes: ['a sha256 hash', ...]
}
```

The possible actions are `announce`, `unannounce`, `subscribe`, and `unsubscribe`.

By sending an `announce` action, a peer declares that it wants other peers interested in the included info hashes to know about it (via it's peer ID).
Sending an `unannounce` action removes that declaration for the included info hashes.
When the client disconnects, the tracker will automatically unannounce all info hashes that the peer has announced.

By sending a `subscribe` action, a peer declares that it is interested in knowing which peers have announced the included info hashes.
All peers that have already announced the included info hashes will be send to the subscribing peer.
As additional peers announce or unannounce the included info hashes, the subscribing peer will be updated until they send an `unsubscribe` action.
The updates are JSON:

```js
{
    action: 'anounce or unanounce'
    peer: 'a sha256 hash',
    info_hash: 'a sha256 hash'
}
```

## Testing

 To run the server locally at [localhost:5001](), run:

```bash
sudo docker compose up --build
```

You can run test scripts with:

```bash
docker compose exec graffiti-tracker app/test/tracker.py
```

And shut down with:

```bash
sudo docker compose down -v --remove-orphans
```

## Deployment

### Dependencies

On your server install:

- Docker Engine including the Docker Compose plugin via [these instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).
- Certbot according to [these instructions](https://certbot.eff.org/instructions?ws=other&os=ubuntufocal).

### SSL

Add an A and CNAME entry for the `tracker.DOMAIN` and `peerjs.DOMAIN` subdomains by adding these lines to your DNS (where `DOMAIN` is replaced with your server's domain):

```
tracker.DOMAIN.  1800 IN A DOMAIN_IP
peerjs.DOMAIN.   1800 IN CNAME peerjs.DOMAIN
```
    
Once these changes propagate (it might take up to an hour), generate SSL certificates with:

```bash
sudo certbot certonly --standalone -d tracker.DOMAIN,peerjs.DOMAIN
```

Every couple of months you will need to run

```bash
sudo certbot renew
```

### Configuration

Clone this repository onto the server and in the root directory of the repository create a file called `.env` with contents as follows:

```bash
# The domain name that points to the server
DOMAIN="example.com"
```

### Launching

Once everything is set up, start a [`screen`](https://www.gnu.org/software/screen/manual/screen.html) then start the server by running

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build
```
and shut it down by running

```bash
sudo docker compose down --remove-orphans
```