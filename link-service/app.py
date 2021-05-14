#!/usr/bin/env python3

import uuid
import redis
from flask import Flask, redirect, request, Response, render_template, abort
from flask_socketio import SocketIO

r = redis.Redis(host='redis')
app = Flask(__name__)
socketio = SocketIO(app)

def get_addr(mimetype, data):
    return uuid.uuid5(uuid.NAMESPACE_URL, mimetype + data.decode())

@app.route('/', methods=['POST'])
def add_content():
    data = request.data
    mimetype = request.mimetype
    addr = get_addr(mimetype, data)
    r.hset(addr.bytes, 'mimetype', mimetype)
    r.hset(addr.bytes, 'data', data)
    return str(addr)

@app.route('/<uuid:addr>')
def get_content(addr):
    # Fetch the mimetype 
    mimetype = r.hget(addr.bytes, 'mimetype')
    if not mimetype: abort(404)
    mimetype = mimetype.decode()
    wrap = False
    if mimetype == 'text/ours':
        mimetype = request.accept_mimetypes.best_match(['text/ours', 'text/html'])
        wrap = (mimetype == 'text/html')
    if mimetype not in request.accept_mimetypes:
        abort(406)

    # Fetch the data
    data = r.hget(addr.bytes, 'data')
    if not data: abort(404)
    if wrap:
        print("I should be wrapping")

    return Response(data, mimetype=mimetype)

@app.route('/<uuid:addr>', methods=['POST'])
def add_child(addr):
    try:
        child_addr = uuid.UUID(request.data.decode())
    except ValueError:
        abort(400)
    # Store and publish
    r.sadd(addr.bytes + b'c', child_addr.bytes)
    r.publish(addr.bytes + b'p', child_addr.bytes)
    return "Added"

# @socketio.on('get children')
# def get_children(addr):
    # channel = r.pubsub()
    # channel.subscribe(addr)
    # for msg in channel.listen():
        # if msg['type'] == 'message':
            # emit('new child', msg['data'])

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", debug=True)
