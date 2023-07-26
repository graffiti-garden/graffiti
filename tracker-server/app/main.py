#!/usr/bin/env python3

import re
from os import getenv
from hashlib import sha256
import uvicorn
from fastapi import FastAPI, WebSocket, Response
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from .tracker import Tracker
from .keyserver import KeyServer, Credential
from .schema import validate

app = FastAPI()

# Allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.on_event("startup")
async def startup():
    client = AsyncIOMotorClient('mongo')
    app.tracker = Tracker()
    await app.tracker.initialize(client)
    app.key_server = KeyServer()
    await app.key_server.initialize(client)

@app.websocket("/")
async def on_connect(socket: WebSocket, token: str|None=None):
    await socket.accept()

    # First message is the peer ID
    try:
        peer_proof = await socket.receive_text()
    except:
        return

    if not re.match(r"^[0-9a-f]{64}$", peer_proof):
        try:
            await socket.send_json({
                'error': 'validation',
                'detail': 'invalid peer proof'
            })
        except:
            return
        return

    # Hash to get actual peer
    # (prevents peer impersonation)
    socket.peer = sha256(peer_proof.encode()).hexdigest()

    # Register with the pub/sub manager
    try:
        async with app.tracker.register(socket):
            await socket.send_json({
                'peer_id': socket.peer
            })

            # And reply back and forth
            while True:
                try:
                    msg = await socket.receive_json()
                    await reply(socket, msg)
                except:
                    break
    except Exception as e:
        try:
            await socket.send_json({
                'reply': 'error',
                'detail': str(e)
            })
        except:
            return

async def reply(socket, msg):
    # Initialize the output
    output = {}
    if 'messageID' in msg:
        output['messageID'] = msg['messageID']

    # Make sure the message is formatted properly
    try:
        validate(msg)
    except Exception as e:
        output['reply'] = 'error'
        output['detail'] = str(e).split('\n')[0]
        return await socket.send_json(output)

    # Pass it to the proper function
    action_function = getattr(app.tracker, msg["action"])
    output["reply"] = await action_function(msg["info_hashes"], socket)
    await socket.send_json(output)

@app.get("/")
async def info():
    return {
        "name": "Graffiti Tracker",
        "description": "A websocket tracker for peer-to-peer Graffiti",
        "website": "https://github.com/graffiti-garden/tracker-server/"
    }

@app.post("/key")
async def post_key(credential: Credential, response: Response):
    return await app.key_server.post_key(credential, response)

@app.get("/key/{key}")
async def get_key(key: str, response: Response):
    return await app.key_server.get_key(key, response)

if __name__ == "__main__":
    args = {}
    if getenv('DEBUG') == 'true':
        args['reload'] = True
    else:
        args['port'] = 443
        args['ssl_certfile'] = '/etc/ssl/certs/fullchain.pem'
        args['ssl_keyfile']  = '/etc/ssl/certs/privkey.pem'
    uvicorn.run('app.main:app', host='0.0.0.0', **args)
