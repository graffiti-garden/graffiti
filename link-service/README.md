# Theater

An imagining of a social web.

## Setup

Copy your SSL certificates to ```/etc/ssl/certs/``` and name them ```theater.key``` and ```theater.pem```.

If needed, make changes to:
- ```config/theater.env```,
- the mailserver host/domainname in ```docker-compose.yml```,
- the account name in ```config/mailserver/postfix-accounts.cf```.

Then launch the docker application:

    sudo docker-compose up --build

Once the docker application is running, create domain keys (the exact container name may be different):

    sudo docker exec theater_mailserver_1 setup config dkim

Copy the entry in ```config/mailserver/opendkim/keys/theater.csail.mit.edu/mail.txt``` to your DNS.

<details>
  <summary>On the CSAIL DNS this requires a little bit of reformatting.</summary>

  To get things to work on the CSAIL DNS, split the ```mail.txt``` public key up into segments of < 256 charachters. Then concatenate them onto a single line but with quote marks and spaces between each segment. Like this:

  ```mail._domainkey.theater.csail.mit.edu. 1800 IN TXT "v=DKIM1; h=sha256; k=rsa; p=" "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAyF0CezaT4xRn8OcZZh3SPYiVatL3nDYtflxh7RkJzfJgIarYKszK4rVlXLESECYW7uTlUXsXGUq85Q2N79oBa6+R35Bq+siY/AHc8i3WfOoEG6BUFlK19EpFLv0xwxl+HGbsSIv7TLG0zCgzyXsxiS5bH29SiL" "6yLlejzHJr50DYNEB/EdpsPSap1a4Rkp8K6xKQ0stYo63jxSLA4re7GxaLAurva5gGzJxhKdA7cZJurqNT8j1NJ+NfkOmzkzT9nI/SdDcV5zLW3XflFQ8NAwmco4SB02Bc0j5N23YtYeD5SLb+qCgW/Mnsrirv/NxjgNXQ+z57TMjKUUV3NS6IyctWKL/s1Uqv7VVbHUND" "nNf+ssGD8KzUU0feLO33MZIiCCreFOFafvgqQYtMcN3sC7ovG29vYmXPoHXgLKyXqOkbCEEU2fB+fXja/eGGszFeFwCM4lv16twcCQ/BLwve9ncRZ3xG50HDxD+jYXtVaublPUplAdCYs22/ddm1aOszdfTeSUG+6OpjHr94kjIyiZsKUwxztwuEXlP0v6YcDeUHawupPU" "hwB2dm6AZwyzxPw5LdF/J2MquWMxajXcaMJMaWP8V7cWhIXmOe9O908swPOyeEW/NKp3CEmpaVpNp3HC35CVbtQUIOjDh+Kmyd/uDUVnfiKI3GZsMjoeutr+MCAwEAAQ=="
  ```
</details>

In addition, add these lines to your DNS to turn on DKIM and add SPF:

    _domainkey.theater.csail.mit.edu. 1800 IN TXT "o=-"
    theater.csail.mit.edu. 1800 IN TXT "v=spf1 a -all"

The server with email functionality should now be up and running.

## Test

Use the [Swagger UI](https://theater.csail.mit.edu/docs) to test out most API calls.
To test out the WebSocket-based attend API, go to the [attend test page](https://theater.csail.mit.edu/attend.html).
