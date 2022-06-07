# Graffiti Server

## Local Usage

To launch the server locally, run:

    sudo docker compose up --build

The application will be up at [http://localhost:5000](http://localhost:5000).
If you are using the [Vue.js Graffiti plugin](https://github.com/csail-graffiti/vue), you might point to the local server as follows:

    Graffiti("http://localhost:5000").then(g=>createApp().use(g).mount("#app")

## Contribution

### Overview

This codebase consists of three modules: `auth`, `app`, and `broker`.

- *`auth`* is a webapp served at auth.
- *`broker`* is the critical path of the server. Whenever an item is added 

#### auth

#### app

#### broker

This is the "critical path" of the server.
Whenever any item is added or removed from the database, that change is sent to the broker.
The broker then matches each change with any open query and sends the relevant update back to the `app`.

### Testing

On the machine running the server, you can run through test scrips with

    docker compose exec graffiti-app app/test/schema.py

### Wishlist

It would be really nice if someone implemented...

- An interface to import and export one's own data from the server, perhaps to a git repository.
- Bridges that carry over data from existing social platforms into the Graffiti ecosystem.
- Scaling this stack to work over a network of machines and with multiple copies of instances. Perhaps this involves Kubernetes and AWS...

## Deployment

### Dependencies

On your server install:

- Docker Engine including the Docker Compose plugin via [these instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).
- Certbot according to [these instructions](https://certbot.eff.org/instructions?ws=other&os=ubuntufocal).

### Configuration

Clone this repository onto the server and edit the following variables in the `.env` file.

- `DOMAIN`: this should be the domain that points to your server, *e.g.* `graffiti.csail.mit.edu`. 
- `SECRET`: this is used to authenticate users with the server. Make it unique and **keep it safe**!

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

First launch the server:

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

Once the docker application is running, create domain keys for the mail server:

    sudo docker exec graffiti-mailserver setup config dkim

Copy the generated entry in `config/mailserver/opendkim/keys/DOMAIN/mail.txt` to your DNS.
To get things to work on the [CSAIL DNS](https://webdns.csail.mit.edu/), the entire `mail.txt` needs to be on a single line, but split up into segments of less than 256 characters.
The generated file should already be split, but the sections are on new lines. Replace the new lines with spaces so it looks like this:

    mail._domainkey.DOMAIN. 1800 IN TXT "v=DKIM1; h=sha256; k=rsa; p=" "MII...SiL" "6yL...UND" ...

In addition, add these lines to your DNS to turn on the email security features DKIM and SPF:

    _domainkey.DOMAIN. 1800 IN TXT "o=-"
    DOMAIN. 1800 IN TXT "v=spf1 a -all"

Once the DNS propagates (again, it might take an hour), you can test that the mail server is working by going to
`https://auth.DOMAIN/client_id=&redirect_uri=`.
Send an email to `test@allaboutspam.com` then go to [All About Spam](http://www.allaboutspam.com/email-server-test-report/index.php) and enter `noreply@DOMAIN` to see your test report.

### Launching

Once everything is set up, you can start the server by running

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

and shut it down by running

    sudo docker compose down --remove-orphans
