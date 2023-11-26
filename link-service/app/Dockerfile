FROM python:3.12.0-alpine3.18
COPY requirements.txt /tmp/

# Don't save build dependencies
# to keep things small
RUN apk add --no-cache build-base libffi-dev && \
    pip install -r /tmp/requirements.txt && \
    apk del build-base libffi-dev

WORKDIR /mount
CMD python -m app.main