FROM python:3.9.5-slim-buster

RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    g++

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /mount
CMD python -m theater.main
