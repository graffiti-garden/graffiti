# Graffiti

An imagining of a social web.

## Usage

### Local

To launch this application locally for testing, run:

    sudo docker compose up --build

The application will be available at [http://localhost:5000](http://localhost:5000).
An Swagger interface for testing the API is available at [http://localhost:5000/docs](http://localhost:5000/docs).

### Deployment

Install docker via [these instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository) and docker compose v2 via [these instructions](https://docs.docker.com/compose/cli-command/#install-on-linux). Make sure docker compose is installed to root.

Install certbot according to [these instructions](https://certbot.eff.org/instructions?).
Then generate an SSL certificate with:

    sudo certbot certonly --standalone

This will generate the following files:

    /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem
    /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem

Modify the corresponding SSL paths under `nginx` and `mailserver` in `docker-compose.deploy.yml`. Additionally make changes to:

- `hostname` and `domainname` under `mailserver`
- `AUTH_CODE_MAIL_FROM` under `graffiti`
- The email address in `config/mailserver/postfix-accounts.cf`
- The postmaster address in `config/mailserver.env`

Then launch the docker application:

    sudo docker compose -f docker-compose.yml -f docker-compose.deploy.yml up --build

Once the docker application is running, create domain keys for the mail server:

    sudo docker exec graffiti-mailserver setup config dkim

Copy the generated entry in `config/mailserver/opendkim/keys/YOUR_DOMAIN/mail.txt` to your DNS.
To get things to work on the [CSAIL DNS](https://webdns.csail.mit.edu/), the entire `mail.txt` needs to be on a single line, but split up into segments of less than 256 charachters.
The generated file should already be split, but the sections are on new lines. Replace the new lines with spaces so it looks like this:

    mail._domainkey.YOUR_DOMAIN. 1800 IN TXT "v=DKIM1; h=sha256; k=rsa; p=" "MII...SiL" "6yL...UND" ...

In addition, add these lines to your DNS to turn on DKIM and add SPF:

    _domainkey.YOUR_DOMAIN. 1800 IN TXT "o=-"
    YOUR_DOMAIN. 1800 IN TXT "v=spf1 a -all"

The server with email functionality should now be up and running.
Once the DNS propogates, you can test that it's working by going to
`https://YOUR_DOMAIN/auth?client_id=&redirect_uri=`.
Send an email to `test@allaboutspam.com` then go to [All About Spam](http://www.allaboutspam.com/email-server-test-report/index.php) and enter `noreply@YOUR_DOMAIN` to see your test report.

To shut down the server run:

    sudo docker compose down --remove-orphans
