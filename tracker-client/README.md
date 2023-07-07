# Graffiti Tracker

This client library interacts with the [tracker server](https://github.com/graffiti-garden/tracker-server/)

## Tracker Server

The server wraps up the tracker, served at `tracker.DOMAIN`, and a [PeerJS server](https://github.com/peers/peerjs-server), served at `peerjs.DOMAIN`. To run the server locally at [localhost:5001](), run:

    sudo docker compose up --build

And for production run:

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

In either case, shut down with:

    sudo docker compose down -v --remove-orphans

### Testing

You can test the tracker server with:

    docker compose exec graffiti-tracker app/test/tracker.py
