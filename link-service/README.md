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

Make sure the server has [Docker compose installed](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).

Then, if you are deploying the service behind a reverse proxy, you can simply run it as described above.
You may want to change the port in `docker-compose.override.yml` to something that doesn't conflict:

```yml
graffiti-link-service:
    ports:
        - 8000:12345
```

If you are not using a reverse proxy, follow the instructions below.

### SSL

First add a DNS entry for your domain, where `DOMAIN` is replaced with your desired domain (for example `graffiti.example.com`), and `DOMAIN_IP` is the IP of the server:

```
DOMAIN. 1800 IN A SERVER_IP
```

While these changes propagate (it might take up to an hour) install certbot according to [these instructions](https://certbot.eff.org/instructions?ws=other&os=ubuntufocal).

Once you can ping `DOMAIN` and get your server's IP, run:

```bash
sudo certbot certonly --standalone -d DOMAIN
```

Then clone this repository onto the server and in the root directory of the repository create a file called `.env` with your domain:

```bash
DOMAIN=graffiti.example.com
```
Once everything is set up, you can start the server by running the following in the cloned repo:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build
```

and shut it down by running

```bash
sudo docker compose down --remove-orphans
```