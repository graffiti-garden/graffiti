# Theater

An imagining of a social web.

## Setup

### Docker

    sudo docker-compose up --build

### Nginx

    sudo ln -s $(pwd)/config/nginx.conf /etc/nginx/
    sudo service nginx start

## Test

Use the [Swagger UI](https://theater.csail.mit.edu/docs) to test out most API calls.
To test out the WebSocket-based attend API, go to the [attend test page](https://theater.csail.mit.edu/attend.html).
