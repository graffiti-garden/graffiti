# Ours

## Nginx Installation

Create a file at ```/etc/uwsgi/ours.ini``` containing:

    [uwsgi]
    chdir = PATH_TO_OURS_DIRECTORY
    wsgi-file = gateway.py
    plugins = python

Then, start the socket:

    sudo systemctl enable --now uwsgi@ours.socket

Modify the ```http``` section of ```/etc/nginx/nginx.conf``` so that a chosen port points to the gateway:

    http {

      ...

      server {
        listen PORT;

        location / {
          client_max_body_size 25M;
          include uwsgi_params;
          uwsgi_pass unix:/var/run/uwsgi/ours.sock;
        }
      }

      ...

    }

Restart ```nginx```:

    sudo systemctl restart nginx

The gateway should now be live at ```http://URL:PORT```. If you modify the gateway, it can be reloaded by running:

    sudo systemctl restart uwsgi@ours
