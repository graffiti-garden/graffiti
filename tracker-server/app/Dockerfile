FROM python:3.11.4-slim-bookworm

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /mount
CMD python -m app.main
