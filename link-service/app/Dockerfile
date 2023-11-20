# FROM python:3.12.0-slim-bookworm
FROM python:3.11.6-slim-bookworm

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /mount
CMD python -m app.main
