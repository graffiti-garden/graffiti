# TODO: make slim once aiohttp/frozenlist updates
FROM python:3.12.0-bookworm

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /mount
CMD python -m app.main
