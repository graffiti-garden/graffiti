FROM python:3.11.0-slim-bullseye

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /mount
CMD python -m broker.main
