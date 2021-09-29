#!/usr/bin/env python3

import asyncio
import aioredis
import uvicorn
import hashlib
import mimetypes
import random
import string
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response, HTTPException, File, UploadFile, Depends, Response
from fastapi.staticfiles import StaticFiles

from theaterpy.config import *
from theaterpy.security import token_to_user, router as security_router

app = FastAPI()
app.include_router(security_router)


@app.post('/alloc')
async def alloc(user: str = Depends(token_to_user)):
    # Create a random URL
    url = ''.join(random.choice(string.ascii_letters) for _ in range(URL_SIZE))

    # Add the user to it
    r = await open_redis()
    await r.hset('url' + url, 'user', user)

    return {'url': url}


@app.put('/pod/{url}')
async def put(
        url: str,
        user: str = Depends(token_to_user),
        data: UploadFile = File(...)):

    # Connect to the database
    r = await open_redis()

    # Make sure the URL is assigned to the user
    owner = await r.hget('url' + url, 'user')
    if not owner or user != owner.decode():
        raise HTTPException(status_code=403, detail=f"{user} doesn't have permission to write to {url}")

    # Set the data
    media_type = mimetypes.guess_type(data.filename)[0]
    if not media_type:
        media_type = "application/octet-stream"
    await r.hset('url' + url, 'media_type', media_type)
    datab = await data.read()
    await r.hset('url' + url, 'data', datab)

    return "Success"


@app.get('/pod/{url}')
async def get(url: str):

    # Connect to the database
    r = await open_redis()

    # Check if the URL exists
    if not await r.hexists('url' + url, 'data'):
        print("nope")
        raise HTTPException(status_code=404, detail="Not Found")

    # Fetch the data
    datab      = await r.hget('url' + url, 'data')
    media_type = (await r.hget('url' + url, 'media_type')).decode()

    return Response(datab, media_type=media_type)


@app.delete('/pod/{url}')
async def delete(url: str, user = Depends(token_to_user)):

    # Connect to the database
    r = await open_redis()

    # Make sure it is owned by the user
    owner = await r.hget('url' + url, 'user')
    if not owner or user != owner.decode():
        raise HTTPException(status_code=403, detail=f"{user} doesn't have permission to delete {url}")

    # Delete the data and mimetype (keep ownership)
    await r.hdel('url' + url, 'data', 'mimetype')

    return "Success"


def scene_action_to_uuid(scene: str, action: str):
    # Concatenate the hashes of the scene and action
    # This prevents trickiness where
    # scene+action is ambiguous
    scene_hash  = hashlib.sha256( scene.encode()).digest()
    action_hash = hashlib.sha256(action.encode()).digest()
    return scene_hash + action_hash


@app.post('/perform')
async def perform(
        scene: str, action: str,
        user = Depends(token_to_user)):

    # Get a unique performance ID that
    # describes the scene/action pair
    per = scene_action_to_uuid(scene, action)

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock(b'loc' + per)
    await lock.acquire()

    # If no user is already performing
    if await r.scard(b'per' + per) == 0:
        # Add it to the stream
        xid = await r.xadd('scn' + scene, {'act': action})
        # Map the performance to its
        # stream ID so it can be deleted.
        await r.hset(b'xid' + per, 'xid', xid)

    # Add the user to the performance
    await r.sadd(b'per' + per, user)

    # Release
    await lock.release()
    return "Success"


@app.post('/retire')
async def retire(
        scene: str, action: str,
        user = Depends(token_to_user)):

    # Get a unique performance id that
    # describes the scene/action pair
    per = scene_action_to_uuid(scene, action)

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock(b'loc' + per)
    await lock.acquire()

    # Remove the user from the performance
    await r.srem(b'per' + per, user)

    # If no user is performing
    # remove the performance from the stream
    if await r.scard(b'per' + per) == 0:
        # Get the stream ID of the performance
        xid = await r.hget(b'xid' + per, 'xid')
        if xid:
            # Remove it from the stream
            await r.xdel('scn' + scene, xid)
            await r.hdel(b'xid' + per, 'xid')

    # Release
    await lock.release()
    return "Success"


@app.websocket("/attend")
async def attend(ws: WebSocket):
    # Accept and create object
    await ws.accept()
    at = Attend()

    # Listen for updates
    while True:
        try:
            msg = await ws.receive_json()
        except WebSocketDisconnect:
            break

        # Send it to the object
        await at.receive(ws, msg)

class Attend:

    def __init__(self):
        self.attending = {}
        self.task  = None

    async def receive(self, ws: WebSocket, msg):
        # Kill the task if it exists
        if self.task: self.task.cancel()

        # Add any new scenes to attend to
        for scene in msg.get('add', []):
            if not scene: continue
            key = 'scn' + scene
            if key not in self.attending:
                self.attending[key] = '0'

        # And remove scenes
        for scene in msg.get('rem', []):
            if not scene: continue
            self.attending.pop('scn' + scene, None)

        # Return the attending list as acknowledgment
        ack = {'attending': [scene[3:] for scene in self.attending.keys()]}
        await ws.send_json(ack)

        # Start a background listening task if non-empty
        if self.attending:
            self.task = asyncio.create_task(self.attend(ws))
        else:
            self.task = None

    async def attend(self, ws: WebSocket):
        # Connect to the database
        r = await open_redis()

        while True:
            # Wait for new events
            events = await r.xread(self.attending,
                                   block=ATTEND_INTERVAL)

            # Extract the URLs
            actions = {}
            for scene, sceneevents in events:
                scene = scene.decode()[3:]
                actions[scene] = []
                for id_, event in sceneevents:
                    self.attending['scn' + scene] = id_
                    actions[scene].append(event[b'act'].decode())

            # Send the output
            obs = {'observed': actions}
            try:
                await ws.send_json(obs)
            except:
                break

# Mount the static files all the way
# at the end here so the '/' route doesn't
# conflict with the routes above.
app.mount('/js', StaticFiles(directory="js"))
app.mount('/', StaticFiles(directory='html', html=True))

# Open and close a redis connection
async def open_redis():
    return await aioredis.from_url("redis://redis")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
