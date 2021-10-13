# Theater

An imagining of a social web.

## Setup

Copy your SSL certificates to ```/etc/ssl/certs/``` and name them ```theater.key``` and ```theater.pem```.

If needed, make changes to:
- ```config/theater.env```,
- the mailserver host/domainname in ```docker-compose.yml```,
- the account name in ```config/mailserver/postfix-accounts.cf```.

The launch the docker application:

    sudo docker-compose up --build

Then create domain keys:

    sudo docker exec theater_mailserver_1 setup config dkim

Copy the entry in ```config/mailserver/opendkim/keys/theater.csail.mit.edu/mail.txt``` to your DNS.

In addition, add these lines to your DNS:

    theater.csail.mit.edu. 1800 IN TXT "v=spf1 a -all"
    _domainkey.theater.csail.mit.edu. 1800 IN TXT "o=-"

## Test

Use the [Swagger UI](https://theater.csail.mit.edu/docs) to test out most API calls.
To test out the WebSocket-based attend API, go to the [attend test page](https://theater.csail.mit.edu/attend.html).
