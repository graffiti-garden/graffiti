# Theater

An imagining of a social web.

## Setup

Copy your SSL certificates to ```/etc/ssl/certs/``` and name them ```theater.key``` and ```theater.pem```.

If needed, make changes to:
- ```config/theater.env```,
- the host/domainname in ```docker-compose.yml```,
- the account name in ```config/postfix-accounts.cf```.

Also generate openkdim keys. Put them and this line in the DNS record:

    theater.csail.mit.edu. 1800 IN TXT "v=spf1 a -all"

Then launch the application through docker:

    sudo docker-compose up --build

## Test

Use the [Swagger UI](https://theater.csail.mit.edu/docs) to test out most API calls.
To test out the WebSocket-based attend API, go to the [attend test page](https://theater.csail.mit.edu/attend.html).
