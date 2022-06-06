FROM python:3.10.4-slim-bullseye

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

WORKDIR /mount
CMD python -m auth.main
