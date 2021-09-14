#!/usr/bin/env python3

import asyncio
import aioredis
import uvicorn
import hashlib
import mimetypes
from fastapi import FastAPI, WebSocket, Response, HTTPException, File, UploadFile, Depends, Response

# The rate that websockets are kept alive
PING_PONG_INTERVAL = 2
CHILDREN_INTERVAL = 5

async def token_to_user(token: str):
    # TODO implement user account creation and OAuth token
    # creation. Then make a map from allocated tokens -> users
    # First verify that the token is allocated (if not, 400),
    # otherwise return the associated user.
    if not token:
        raise HTTPException(status_code=400, detail="invalid token")
    return token

@app.put('/{url}')
async def put(
        url: str,
        user: str = Depends(token_to_user),
        urlinv: Optional(str) = None,
        data: UploadFile = File(...)):

    # Connect to the database
    r = await open_redis()

    if not urlinv:
        # Make sure the URL is assigned to the user
        if not user == await r.hget(url, 'user'):
            await close_redis(r)
            raise HTTPException(status=403, detail=f"{user} doesn't have permission to write to {url}")
    else:
        # Check to see if the user can prove their claim
        url_ = hashlib.sha256(urlinv.encode()).hexdigest()
        if url != url_:
            await close_redis(r)
            raise HTTPException(status_code=400, detail=f"incorrect hash, {url} can't be allocated to {user}")
        await r.hset(url, 'user', user)

    # Set the data
    media_type = mimetypes.guess_type(data.filename)[0]
    await r.hset(url, 'media_type', media_type)
    datab = await data.read()
    await r.hset(url, 'data', datab)

    # Disconnect 
    await close_redis(r)
    return "success"


@app.get('/{url}')
async def get(url: str):

    # Connect to the database
    r = await open_redis()

    # Check if the URL exists
    if not await r.hexists(url, 'data'):
        await close_redis(r)
        raise HTTPException(status=404, detail="Not found")

    # Fetch the data
    datab      = await r.hget(url, 'data')
    media_type = await r.hset(url, 'media_type')

    # Disconnect 
    await close_redis(r)
    return Response(data, media_type=media_type)


@app.delete('/{url}')
async def delete(url: str, user = Depends(token_to_user)):

    # Connect to the database
    r = await open_redis()

    # Make sure it is owned by the user
    if not user == await r.hget(url, 'user'):
        await close_redis(r)
        raise HTTPException(status=403, detail=f"{user} doesn't have permission to delete {url}")

    # Delete the data and mimetype (keep ownership)
    r.hdel(url, 'data', 'mimetype')

    # Disconnect
    await close_redis(r)
    return "success"


async def key_url_to_uuid(key: str, url: str):
    # Concatenate the hashes of the key and url
    # This prevents trickiness where
    # key+url is ambiguous
    key_hash = hashlib.sha256(key.encode()).digest()
    url_hash = hashlib.sha256(url.encode()).digest()
    return key_hash + url_hash

@app.post('/perform')
async def perform(
        key: str, url: str,
        user = Depends(token_to_user)):

    # Connect to the database
    r = await open_redis()

    # Get a unique id that describes the key/url pair
    uuid = key_url_to_uuid(key + url)

    # Check to see if the pair is new
    if r.scard(uuid) == 0:
        # If it is, add it to the stream
        xid = await r.xadd(key, url)
        # Map the uuid to its stream id
        # so it can be deleted.
        await r.hset(uuid, 'xid', xid)

    # TODO: I think there's a concurrency
    # bug here if a user sends two requests
    # at the same time

    # Add the user to the pair's performers
    r.sadd(uuid, user)

    # Disconnect
    await close_redis(r)
    return "success"


@app.post('/retire')
async def retire(
        key: str, url: str,
        user = Depends(token_to_user)):

    # Connect to the database
    r = await open_redis()

    # Get a unique id that describes the key/url pair
    uuid = key_url_to_uuid(key + url)

    # Remove the user from the pair's performers
    r.srem(uuid, user)

    # If no one is performing,
    # remove the pair from the stream
    if r.scard(uuid) == 0:
        # Get the stream ID of the pair
        xid = await r.hget(uuid, 'xid')
        # Remove it from the stream
        await r.xdel(uuid, xid)

    # Connect to the database
    return "success"


@app.websocket("/")
async def attend(ws:  WebSocket):

    # Open the websocket connection
    await ws.accept()
    r = await open_redis()

    # Initialize list to attend to
    attending = []

    # Fetch ancient children
    latest_id = '0'
    events = None

    while True:
        # Initialize a JSON object

        # If there are events, send them
        if events:
            for key, e_id, url in events:
                latest_id = e_id

                try:
                    await ws.send_text(str(child))
                except:
                    break

        try:
            await ws.send_text(str(child))
        except:
            break

        # Wait for a list of new streams to add or delete, which could be none.
        message = await asyncio.wait_for(ws.receive_text(), PONG_INTERVAL)
        # Add or delete them from the list
        attending += message

        # Wait for new events
        events = await r.xread(attending,
                               latest_ids=[latest_id],
                               timeout=CHILDREN_INTERVAL)

    # Disconnect 
    await close_redis(r)


# Open and close a redis connection
async def open_redis():
    return await aioredis.create_redis_pool('redis://redis')
async def close_redis(r):
    r.close()
    await r.wait_closed()

if __name__ == "__main__":
    uvicorn.run("weave:app", host="0.0.0.0", port=5000, reload=True)
