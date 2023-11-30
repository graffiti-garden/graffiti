# Graffiti Link Service

This is an end-to-end encrypted link service.
Users can create uni-directional links that point from a source URI to a destination URI and also stream the links that they or other users have created from any particular source URI.
This can be used as a low-level building block to create custom social media applications by acting as a generic "middle-man" to facilitate content discovery.

For examle:
- The set of links pointing from an article's URL can form it's comments section.
- The set of links pointing from a user's identifier (such as the URL of their personal website) include their public posts.
- The set of links pointing from a book's ISBN can include reviews of that book.

Links are also malleable. Once created, their creators can modify either endpoint. They may also set them to expire at a particular time.

## Local Usage

To launch the service locally, run:

```bash
sudo docker compose up --build
```

The application will be up at [http://localhost:8000](http://localhost:8000).
    
### Testing

There are a series of test scripts in the `app/test` folder which you can run as follows

```bash
docker compose exec graffiti-link-service python -m unittest discover -v
```

Alternatively, you can run an individual test suite with:

```bash
docker compose exec graffiti-link-service python -m unittest app.test.test_rest
```

## Deployment

Make sure the server has [Docker enging and compose](https://docs.docker.com/engine/install/#server), [Certbot](https://certbot.eff.org/instructions), and [Tor](https://community.torproject.org/onion-services/setup/install/) installed.

Purchase a domain name if you don't already have one and generate a vanity hidden service onion address if you would like using [mkp224o](https://github.com/cathugger/mkp224o).

Add a DNS entry for your domain, where `DOMAIN` is replaced with your desired domain (for example `graffiti.example.com`), and `DOMAIN_IP` is the IP of the server:

```
DOMAIN. 1800 IN A SERVER_IP
```

Once you can ping `DOMAIN` and get your server's IP (it can take up to an hour for DNS changes to propogate), run:

```bash
sudo certbot certonly --standalone -d DOMAIN
```

If you generated a vanity onion address, copy the contents to `/var/run/lib/graffiti/`:

```bash
sudo cp -r graffiti54as6d54....onion /var/lib/tor/graffiti
```

Clone this repository to the server. Then link `torrc` into the system config file:

```bash
sudo ln -f link-service/config/tor/torrc /etc/tor/torrc
```

Then enable and restart `tor`:

```bash
sudo systemctl enable --now tor
sudo systemctl restart tor
```

In the root of the repository, create a `.env` file defining your public domain and onion domains. If you didn't generate a vanity onion address, one will have been randomly selected when you started tor:

```bash
echo "DOMAIN=graffiti.example.com" >> link-service/.env
echo "ONION_DOMAIN=$(sudo cat /var/lib/tor/graffiti/hostname)" >> link-service/.env
```

Once all this setup is complete, `cd` into the repo and start the service with

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build
```

and shut it down by running

```bash
sudo docker compose down --remove-orphans
```
