# Graffiti Server


This is a web server that can be used as the communication and storage backend for many different types of social applications including applications like Facebook, Reddit and Google Docs.
Moreover, these applications can all function on top of the same server instance at the same time and to the degree that they have overlapping functionality, they will naturally interoperate.
We hope that this serves both as a powerful prototyping tool and as a proof of concept that an ecosystem of social applications can exist that isn't subject to [collective vendor lock-in](https://en.wikipedia.org/wiki/Vendor_lock-in#Collective_vendor_lock-in).

A reference client library built as an extension of the Vue.js web framework along with example applications are available [here](https://github.com/graffiti-garden/graffiti-x-vue).

## Local Usage

To launch the server locally, run:

    sudo docker compose up --build

The application will be up at [http://localhost:5001](http://localhost:5001).
If you are using the [Vue.js Graffiti plugin](https://github.com/graffiti-garden/graffiti-x-vue), you might point to the local server as follows:

    Graffiti("http://localhost:5001").then(g=>createApp().use(g).mount("#app"))
    
When you are running the server locally, login links will be printed to your terminal rather than sent to your email.
You can quickly test the login functionality by going to [http://auth.localhost:5001?client_id=&redirect_uri=https://example.com](https://auth.localhost:5001?client_id=&redirect_uri=https://example.com)

### Testing

There are a series of test scripts in the `app/test` folder which you can run as follows

    docker compose exec graffiti-app app/test/schema.py
    
Only run these scripts locally! They will fill your server up with a lot of junk.

## Design Overview

The codebase consists of two modules, `auth` and `app`. Each module has its own folder and exists as a separate docker container. A docker compose file hooks the three modules together along with [MongoDB](https://www.mongodb.com/), [nginx](https://nginx.org/en/) and [docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/edge/) to form a complete application. The current implementation only spawns a single instance of `auth` and `app`, however neither keeps track of any global state so theoretically many instances could be spawned to scale the system.

### `auth`

implements the [OAuth2](https://www.oauth.com/) standard to authorize users with the server. Users log in by clicking a link sent to their email so no passwords are stored on the server. `auth` is served at `auth.DOMAIN` where `DOMAIN` is the domain of your server.

### `app`

exposes the Graffiti database API via a websocket served at `app.DOMAIN`. The API consists of 6 basic functions:

- `update`: inserts a tagged JSON object into the database or replaces an object the requester already inserted.
- `remove`: removes an object the requester already inserted.
- `subscribe`: fetches all the objects containing a set of tags and streams future changes to objects with those tags.
- `unsubscribe`: stops streaming results from certain subscribed tags.
- `get`: fetches a particular object.
- `list`: lists all tags the requester has tagged objects with.

The JSON objects are schemaless aside from 4 regulated fields:

- `_key`: is a random identifier that must be added to each object. A user can't store more than one object with the same `_key`; trying to create an object with the same `_key` as an existing object will simply replace the existing object. Different users *can* store objects with the same `_key`, so there is no worry of someone else replacing your object.
- `_by`: this field must be equal to the operating user's identifier returned by the `auth` module — users can only create objects `_by` themselves.
- `_tags`: this must be a list of strings with at least one entry. Objects can only be seen by subscribing to one of its tags.
- `_to`: this field is optional, but if included it must be equal to a list of unique user identifiers. The object will only be seen by it's creator and the listed users. If the `_to` field is not included, anyone can see the object. If it is an empty list, only the creator can see the object.

Objects can't include any other top-level fields that start with `_`.

## Deployment

### Dependencies

On your server install:

- Docker Engine including the Docker Compose plugin via [these instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).
- Certbot according to [these instructions](https://certbot.eff.org/instructions?ws=other&os=ubuntufocal).

### Configuration

Clone this repository onto the server and in the root directory of the repository create a file called `.env` with contents as follows:

    # The domain name that points to the server
    DOMAIN="graffiti.example.com"

    # A string used to encrypt authorization tokens
    SECRET="something only i know"

Make your secret unique and **keep it safe**!

### SSL

Add CNAME entries for the `app.DOMAIN` and `auth.DOMAIN` subdomains by adding these lines to your DNS (where `DOMAIN` is replaced with your server's domain):

    app.DOMAIN.  1800 IN A DOMAIN_IP
    auth.DOMAIN. 1800 IN CNAME app.DOMAIN
    
Once these changes propagate (it might take up to an hour), generate SSL certificates with:

    sudo certbot certonly --standalone -d DOMAIN,app.DOMAIN,auth.DOMAIN

### Mailserver

Create a file at `config/mailserver/postfix-accounts.cf` containing just the string `noreply@DOMAIN`. Then launch the server:

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

Once the docker application is running, create domain keys for the mail server:

    sudo docker exec graffiti-mailserver setup config dkim

Copy the generated entry in `config/mailserver/opendkim/keys/DOMAIN/mail.txt` to your DNS.
To get things to work on some DNS systems, the entire `mail.txt` needs to be on a single line, but split up into segments of less than 256 characters.
The generated file should already be split, but the sections are on new lines. Replace the new lines with spaces so it looks like this:

    mail._domainkey.DOMAIN. 1800 IN TXT "v=DKIM1; h=sha256; k=rsa; p=" "MII...SiL" "6yL...UND" ...

In addition, add these lines to your DNS to turn on the email security features DKIM and SPF:

    _domainkey.DOMAIN. 1800 IN TXT "o=-"
    DOMAIN. 1800 IN TXT "v=spf1 a:app.DOMAIN -all"

Once the DNS propagates (again, it might take an hour), restart the server and test that the mailer is working by going to
`https://auth.DOMAIN/?client_id=&redirect_uri=`.
Send an email to `test@allaboutspam.com` then go to [All About Spam](http://www.allaboutspam.com/email-server-test-report/index.php) and enter `noreply@DOMAIN` to see your test report.

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
