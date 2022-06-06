# Graffiti Server

## Local Usage

To launch this application locally, run:

    sudo docker compose up --build

The application will be up at [http://localhost:5000](http://localhost:5000).
If you are using the [Vue.js Graffiti plugin](https://github.com/csail-graffiti/vue), you might point your app to your local server as follows:

    Graffiti("http://localhost:5000").then(g=>createApp().use(g).mount("#app")

## Deployment

### Dependencies

On your server install

- Docker via [these instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository) and docker compose v2 via [these instructions](https://docs.docker.com/compose/cli-command/#install-on-linux). Make sure docker compose is installed to root.
- Certbot according to [these instructions](https://certbot.eff.org/instructions?).

### Configuration

Clone this repository onto the server and edit the `.env` file.
Make sure you change the `DOMAIN` variable to the domain name of your server (e.g. `graffiti.csail.mit.edu`) and change the `SECRET` variable to something secure only you know. The `SECRET` variable is used to authenticate users on the server so don't publicize it!

### DNS

Add the `app.DOMAIN` and `auth.DOMAIN` subdomains (where `DOMAIN` is domain name of your server) as CNAME's in your DNS with the following lines:

    app.DOMAIN.  1800 IN CNAME DOMAIN
    auth.DOMAIN. 1800 IN CNAME DOMAIN

In addition, add these lines to your DNS to turn on the email security features DKIM and add SPF:

    _domainkey.DOMAIN. 1800 IN TXT "o=-"
    DOMAIN. 1800 IN TXT "v=spf1 a -all"

Once these changes propagate (it might take an hour), generate SSL certificates with:

    sudo certbot certonly --standalone -d DOMAIN,app.DOMAIN,auth.DOMAIN

This will generate the following files:

    /etc/letsencrypt/live/DOMAIN/fullchain.pem
    /etc/letsencrypt/live/DOMAIN/privkey.pem

Then launch the docker application:

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

Once the docker application is running, create domain keys for the mail server:

    sudo docker exec graffiti-mailserver setup config dkim

Copy the generated entry in `config/mailserver/opendkim/keys/DOMAIN/mail.txt` to your DNS.
To get things to work on the [CSAIL DNS](https://webdns.csail.mit.edu/), the entire `mail.txt` needs to be on a single line, but split up into segments of less than 256 characters.
The generated file should already be split, but the sections are on new lines. Replace the new lines with spaces so it looks like this:

    mail._domainkey.DOMAIN. 1800 IN TXT "v=DKIM1; h=sha256; k=rsa; p=" "MII...SiL" "6yL...UND" ...

Once the DNS propagates (again it might take an hour), you can test that the mail server is working by going to
`https://auth.DOMAIN/client_id=&redirect_uri=`.
Send an email to `test@allaboutspam.com` then go to [All About Spam](http://www.allaboutspam.com/email-server-test-report/index.php) and enter `noreply@DOMAIN` to see your test report.

### Up and Down

After configuring the server, which only needs to be done once, you can start it by running:

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

and shut it down by running:

    sudo docker compose down --remove-orphans

## Contribution

### Overview

This codebase consists of three primary components: `auth`, `app`, and `broker`.

#### auth

#### app

#### broker

This is the "critical path" of the server.
Whenever any item is added or removed from the database, that change is sent to the broker.
The broker then matches each change with any open query and sends the relevant update back to the `app`.

### Testing

Run test scripts with:

    docker compose exec graffiti-app app/test/schema.py

### Wishlist

- The ability to import and export one's data, perhaps to a git repository.
- Bridges that carry over data from existing social platforms into the Graffiti ecosystem.
- Scaling this stack to work over a network of machines and with multiple copies of instances. Perhaps this involves Kubernetes and AWS...
