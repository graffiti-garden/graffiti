FROM python:3.12.0-slim-bookworm
# TODO: build essentials may not be necessary
# once make slim once aiohttp/frozenlist updates
RUN apt update && apt install build-essential -y

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /mount
CMD python -m app.main