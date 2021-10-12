# Theater

An imagining of a social web.

## Setup

Put SSL certs in ```/etc/ssl/certs/```.

Also generate openkdim keys. Put them and this line in the DNS record:

    theater.csail.mit.edu. 1800 IN TXT "v=spf1 a -all"

Then launch the application through docker:

    sudo docker-compose up --build

## Test

Use the [Swagger UI](https://theater.csail.mit.edu/docs) to test out most API calls.
To test out the WebSocket-based attend API, go to the [attend test page](https://theater.csail.mit.edu/attend.html).
