# Graffiti Server

This is a web server that can be used as the communication and storage backend for many different types of social applications including applications like Facebook, Reddit and Google Docs.
Moreover, these applications can all function on top of the same server instance at the same time and to the degree that they have overlapping functionality, they will naturally interoperate.
We hope that this serves both as a powerful prototyping tool and as a proof of concept that an ecosystem of social applications can exist that isn't subject to [collective vendor lock-in](https://en.wikipedia.org/wiki/Vendor_lock-in#Collective_vendor_lock-in).

A reference client library built as an extension of the Vue.js web framework along with example applications are available [here](https://github.com/digital-graffiti/graffiti-js-vue).

## Local Usage

To launch the server locally, run:

    sudo docker compose up --build

The application will be up at [http://localhost:5001](http://localhost:5001).
If you are using the [Vue.js Graffiti plugin](https://github.com/digital-graffiti/vue), you might point to the local server as follows:

    Graffiti("http://localhost:5001").then(g=>createApp().use(g).mount("#app")
    
When you are running the server locally, login links will be printed to your terminal rather than sent to your email.

## Design Overview

The codebase consists of three modules: `auth`, `app`, and `broker`. Each module has its own folder and exists as a separate docker container. A docker compose file hooks the three modules together along with [MongoDB](https://www.mongodb.com/), [Redis](https://redis.io/), [nginx](https://nginx.org/en/) and [docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/edge/) to form a complete application.

### `auth`

implements the [OAuth2](https://www.oauth.com/) standard to authorize users with the server. Users log in by clicking a link sent to their email so no passwords are stored on the server. `auth` is served at `auth.DOMAIN` where `DOMAIN` is the domain of your server.

### `app`

exposes the Graffiti database API via a websocket served at `app.DOMAIN`. The API consists of 4 basic functions:

- `update`: lets users insert JSON objects into the database or replace objects they have inserted.
- `remove`: lets users remove objects they have put in the database.
- `subscribe`: returns all database entries matching a [MongoDB query](https://www.mongodb.com/docs/manual/tutorial/query-documents/) and then continues to stream new matches as they arrive.
- `unsubscribe`: stops streaming results from a particular `subscribe` request.

The JSON objects are schemaless aside from 5 regulated fields:

- `_id`: is a random identifier that must be added to each object. This field is not searchable, it's only purpose it to uniquely refer to objects so they can be added and replaced. This field is user-assigned for optimistic rendering. A user can't store more than one object with the same `_id`; trying to create an object with the same `_id` as an existing object will simply replace the existing object. Different users *can* store objects with the same `_id`, so there is no worry of someone else replacing your object.
- `_by`: this field must be equal to the operating user's identifier returned by the `auth` module — users can only create objects `_by` themselves.
- `_to`: this field must be equal to a list of unique user identifiers. If this field is included in a query it must be equal to the querier's identifier — users can only query for objects `_to` themselves.
- `_inContextIf`: see [the interactive tutorial](https://digital-graffiti.github.io/graffiti-x-vue/#/context).

Objects can't include any other fields that start with `_` or `$`.

For security and performance purposes, MongoDB query operators are limited to those listed [here](https://github.com/digital-graffiti/server/blob/main/app/schema.py).

### `broker`

is the critical path of the server. Whenever any object is added or removed from the database that object's ID is sent to the broker. The broker matches changed objects with all queries that are currently being subscribed to and then publishes those changes back to `app` to send as results of the `subscribe` function. Optimizing this module will probably yield the most performance gains.

## Contribution

### Testing

There are a series of test scripts in the `app/test` folder which you can run as follows

    docker compose exec graffiti-app app/test/schema.py
    
Only run these scripts locally! They will fill your server up with a lot of junk.

### Wishlist

It would be really nice if someone implemented...

- Bridges that carry over data from existing social platforms into the Graffiti ecosystem.
- Better scaling so the server could operate over multiple machines with multiple instances of each module. Perhaps this involves Kubernetes and AWS...
- Distribution? Decentralization?
- Encryption?

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

    app.DOMAIN.  1800 IN CNAME DOMAIN
    auth.DOMAIN. 1800 IN CNAME DOMAIN

Once these changes propagate (it might take up to an hour), generate SSL certificates with:

    sudo certbot certonly --standalone -d DOMAIN,app.DOMAIN,auth.DOMAIN

This will generate the following files:

    /etc/letsencrypt/live/DOMAIN/fullchain.pem
    /etc/letsencrypt/live/DOMAIN/privkey.pem

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
    DOMAIN. 1800 IN TXT "v=spf1 a -all"

Once the DNS propagates (again, it might take an hour), you can test that the mail server is working by going to
`https://auth.DOMAIN/?client_id=&redirect_uri=`.
Send an email to `test@allaboutspam.com` then go to [All About Spam](http://www.allaboutspam.com/email-server-test-report/index.php) and enter `noreply@DOMAIN` to see your test report.

### Launching

Once everything is set up, you can start the server by running

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

and shut it down by running

    sudo docker compose down --remove-orphans
