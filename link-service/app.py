#!/usr/bin/env python3

import uuid
from uuid import UUID
import aioredis
import uvicorn
from fastapi import FastAPI, Request, WebSocket, Response, HTTPException, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from werkzeug.http import parse_accept_header
from werkzeug.datastructures import MIMEAccept, FileStorage

app = FastAPI(default_response_class=PlainTextResponse)

@app.post('/')
async def add_content(request: Request):
    # Fetch the media type
    if 'content-type' in request.headers:
        media_type = request.headers['content-type']
    else:
        raise HTTPException(status_code=400, detail="Content-Type not specified")
    if '/' not in media_type:
        raise HTTPException(status_code=400, detail=f"\"{media_type}\" is not a valid media type")

    # Fetch the data
    data = await request.body()

    # Compute the address
    addr = uuid.uuid5(uuid.NAMESPACE_URL, media_type + str(data))

    # Write it to the database
    r = await open_redis()
    await r.hset(addr.bytes, 'media_type', media_type.encode())
    await r.hset(addr.bytes, 'data', data)
    await close_redis(r)

    # Return the address
    return str(addr)

@app.get('/{addr}')
async def get_content(addr: UUID, request: Request):
    # Fetch the media type
    r = await open_redis()
    media_type = await r.hget(addr.bytes, 'media_type')
    if not media_type:
        await close_redis(r)
        raise HTTPException(status_code=404, detail=f"No media type found for {str(addr)}")
    media_type = media_type.decode()

    # See if the media type is accepted
    mimetype = FileStorage(content_type=media_type).mimetype
    if 'accept' in request.headers:
        accept_str = request.headers['accept']
    else:
        accept_str = '*/*'
    accept = parse_accept_header(accept_str, MIMEAccept)
    wrap = False
    if 'text/ours' in mimetype:
        mimetype = accept.best_match([mimetype, 'text/html'])
        wrap = (mimetype == 'text/html')
    if mimetype not in accept:
        await close_redis(r)
        raise HTTPException(status_code=406, detail=f"\"{mimetype}\" not accepted by \"{accept_str}\"")

    # Fetch the data
    data = await r.hget(addr.bytes, 'data')
    await close_redis(r)
    if not data:
        raise HTTPException(status_code=404, detail=f"No data at {str(addr)}")

    # Wrap text/ours if necessary
    if wrap:
        # TODO
        media_type = 'text/html'
        pass

    # Return the data
    return Response(data, media_type=media_type)

@app.post('/{addr}')
async def add_child(addr: UUID, request: Request):
    # Get the child address
    body = await request.body()
    try:
        child_addr = UUID(body.decode())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"\"{body.decode()}\" is not a UUID")

    # Write the child to the stream
    r = await open_redis()
    await r.xadd(addr.bytes + b'c', {b'c': child_addr.bytes})
    await close_redis(r)

    # Return success
    return f"Added {str(child_addr)} to {str(addr)}"

@app.websocket("/{addr}")
async def get_children(ws: WebSocket, addr: UUID):
    await ws.accept()
    r = await open_redis()
    latest_id = '0'
    while True:
        events = await r.xread([addr.bytes + b'c'], latest_ids=[latest_id])
        for _, e_id, e in events:
            latest_id = e_id
            child = UUID(bytes=e[b'c'])
            try:
                await ws.send_text(str(child))
            except:
                await close_redis(r)
                return

# Open and close a redis connection
async def open_redis():
    return await aioredis.create_redis_pool('redis://redis')
async def close_redis(r):
    r.close()
    await r.wait_closed()

# Return all exceptions as plain text
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return PlainTextResponse(str(exc.detail), status_code=exc.status_code)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return PlainTextResponse(
            f"\"{request.path_params['addr']}\" is not a UUID",
            status_code=400)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000, debug=True)
