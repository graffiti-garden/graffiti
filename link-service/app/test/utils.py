import jwt
import json
from os import getenv
import websockets
from uuid import uuid4

def random_id():
    return str(uuid4())

def id_and_token():
    secret = getenv('AUTH_SECRET')
    id_ = str(uuid4())
    token = jwt.encode({
        "type": "token",
        "owner_id": id_
        }, secret, algorithm="HS256")
    return id_, token

def websocket_connect(token=None):
    link = "ws://localhost:8000"
    if token:
        link += f"?token={token}"
    return websockets.connect(link)

async def send(ws, j):
    await ws.send(json.dumps(j))

async def recv(ws):
    return json.loads(await ws.recv())
