import jwt
import json
import string
import random
import asyncio
from hashlib import sha256
from os import getenv
import websockets

def random_id(n=20):
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(n))

def random_sha():
    return sha256(random_id().encode()).hexdigest()

def random_actor():
    return f"graffitiactor://{random_sha()}"

def object_base(actor_id):
    object_base = {
        'actor': f"graffitiactor://{actor_id}",
        'id': f"graffitiobject://{actor_id}:{random_id()}",
        'context': ['something']
    }
    return object_base

def actor_id_and_token():
    secret = getenv('AUTH_SECRET')
    id_ = random_sha()
    token = jwt.encode({
        "type": "token",
        'actor': f"graffitiactor://{id_}",
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


async def another_message(ws, recv=recv):
    try:
        async with asyncio.timeout(0.1):
            result = await recv(ws)
            print(result)
    except TimeoutError:
        return False
    else:
        return True
