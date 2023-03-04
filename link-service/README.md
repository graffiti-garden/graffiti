# Graffiti Server


This is a web server that can be used as the communication and storage backend for many different types of social applications including applications like Facebook, Reddit and Google Docs.
Moreover, these applications can all function on top of the same server instance at the same time and to the degree that they have overlapping functionality, they will naturally interoperate.
We hope that this serves both as a powerful prototyping tool and as a proof of concept that an ecosystem of social applications can exist that isn't subject to [collective vendor lock-in](https://en.wikipedia.org/wiki/Vendor_lock-in#Collective_vendor_lock-in).

To interact with the server, you can use the [reference client library](https://github.com/graffiti-garden/graffiti-js) which provides in-browser interactivity via both vanilla Javascript and the Vue.js web framework.

## Local Usage

To launch the server locally, run:

    sudo docker compose up --build

The application will be up at [http://localhost:5001](http://localhost:5001).
    
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

- `update`: inserts a JSON object into the database or replaces an object the requester already inserted.
- `remove`: removes an object the requester already inserted.
- `subscribe`: fetches all the objects containing a set of contexts and streams future changes to objects with those contexts.
- `unsubscribe`: stops streaming results from certain subscribed contexts.
- `get`: fetches a particular object.
- `list`: lists all contexts the requester has tagged objects with.

The JSON objects are schemaless aside from 5 regulated fields, inherited from the [WC3 Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/):

- [`actor`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-actor): this field *must* be a URI containing the user's unique identifier returned by the `auth` module of the form `graffitiactor://ACTOR_ID`.
- [`id`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-id): this field *must* be URI that that contains both the actor's ID and a unique key of the form `graffitiobject://ACTOR_ID:UNIQUE_KEY`. A user can't store more than one object with the same key; trying to create an object with the same key as an existing object will simply replace the existing object. Different users *can* store objects with the same key, so there is no worry of someone else replacing your object.
- [`context`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-context): this *must* be a list of strings with at least one entry. Objects can only be seen by subscribing to one of its contexts.
- [`bto`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-bto), [`bcc`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-bcc): these fields are optional, but if included they *must* be equal to a list of unique actor URIs. The object will only be seen by it's creator and the listed users. If both fields are not included, anyone can see the object. If either or both of the fields exist and both are empty, only the creator can see the object. Both fields function exactly the same, their difference is simply semantic with `bto` referring to the primary private audience and `bcc` referring to the secondary public audience.
- [`published`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-published), [`updated`](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-updated): these fields are optional, but if included they *must* be equal to an ISO formatted date and time with offset. They do not need to be equal to the current time. These currently aren't used for anything may be useful in the future for syncing distributed Graffiti databases.

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

    sudo certbot certonly --standalone -d app.DOMAIN,auth.DOMAIN

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
