FROM python:3.9.5-slim-buster

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /code
CMD python hctp.py
