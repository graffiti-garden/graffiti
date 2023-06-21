import json
import string
import random
from hashlib import sha256
import websockets

def random_string(n=20):
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(n))

def sha(message):
    return sha256(message.encode()).hexdigest()

def random_sha():
    return sha(random_string())

def websocket_connect():
    link = "ws://localhost:8000"
    return websockets.connect(link)

async def send_json(ws, j):
    await ws.send(json.dumps(j))

async def recv_json(ws):
    return json.loads(await ws.recv())
