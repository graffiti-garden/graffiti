import jwt
import json
import string
import random
from hashlib import sha256
from os import getenv
import websockets
from uuid import uuid4

def random_id(n=20):
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(n))

def object_id_and_proof(owner_id, proof=None):
    if not proof:
        proof = random_id()
    object_id = sha256((owner_id+proof).encode()).hexdigest()
    return object_id, proof

def owner_id_and_token():
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
