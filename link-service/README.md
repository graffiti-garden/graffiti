# Graffiti Link Server

This is an end-to-end encrypted link server.
Users can create links from a source URI to a destination URI and view the links that they or other users have created from any particular source URI.
This can be used as a low-level building block to create custom social media applications by acting as a generic "middle-man" to facilitate discovery of user annotations.

For examle:
- The set of links pointing from an article's URL can form it's comments section.
- The set of links pointing from a user's identifier (such as the URL of their personal website) include their public posts.
- The set of links pointing from a book's ISBN can include reviews of that book.

Links are also malleable. Once created, their creators can modify them either endpoints. They may also set them to expire.

## Local Usage

To launch the server locally, run:

    sudo docker compose up --build

The application will be up at [http://localhost:8000](http://localhost:8000).
    
### Testing

There are a series of test scripts in the `app/test` folder which you can run as follows

    docker compose exec graffiti-app python -m unittest app.test.test_rest

## Deployment

### Dependencies

On your server install:

- Docker Engine including the Docker Compose plugin via [these instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).
- Certbot according to [these instructions](https://certbot.eff.org/instructions?ws=other&os=ubuntufocal).

### Configuration

Clone this repository onto the server and in the root directory of the repository create a file called `.env` with contents as follows:

    # The domain name that points to the server
    DOMAIN="graffiti.example.com"

Make your secret unique and **keep it safe**!

### SSL

Add CNAME entries for the `app.DOMAIN` and `auth.DOMAIN` subdomains by adding these lines to your DNS (where `DOMAIN` is replaced with your server's domain):

    app.DOMAIN.  1800 IN A DOMAIN_IP
    auth.DOMAIN. 1800 IN CNAME app.DOMAIN
    
Once these changes propagate (it might take up to an hour), generate SSL certificates with:

    sudo certbot certonly --standalone -d app.DOMAIN,auth.DOMAIN

### Launching

Once everything is set up, you can start the server by running

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

and shut it down by running

    sudo docker compose down --remove-orphans

## TODO

- Bridges that carry data over from existing social platforms (likely matrix)
- End-to-end encryption for private messages
- Distribution
- Decentralization
