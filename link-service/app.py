#!/usr/bin/env python3

import uuid
from uuid import UUID
import aioredis
import uvicorn
from typing import Optional, Set
from fastapi import FastAPI, Request, WebSocket, Response, HTTPException, File, Form, UploadFile
from fastapi.responses import PlainTextResponse, HTMLResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from werkzeug.http import parse_accept_header
from werkzeug.datastructures import MIMEAccept, FileStorage

app = FastAPI(default_response_class=PlainTextResponse)

@app.post('/')
async def add_media(
        data: UploadFile = File(...),
        parents: Optional[Set[UUID]] = Form({})):

    # Read the data
    datab = await data.read()

    # Compute the address
    addr = uuid.uuid5(uuid.NAMESPACE_URL,
            str(datab)        + \
            data.content_type + \
            ''.join([str(p) for p in parents])
            )

    # See if the media already exists
    r = await open_redis()
    if await r.hexists(addr.bytes, 'data'):
        await close_redis(r)
        return str(addr)

    # If not, add it
    await r.hset(addr.bytes, 'media_type', data.content_type.encode())
    await r.hset(addr.bytes, 'data', datab)

    # And add the parents
    for parent in parents:
        await r.xadd(parent.bytes + b'c', {b'c': addr.bytes})
        # TODO: add parents to data itself?
        # await r.xadd(addr.bytes + b'p', {b'p': parent.bytes})
    await close_redis(r)

    # Return the address
    return str(addr)

@app.get('/{addr}')
async def get_media(request: Request, addr: UUID):
    # See if the data exists
    r = await open_redis()
    if not await r.hexists(addr.bytes, 'data'):
        await close_redis(r)
        raise HTTPException(status_code=404, detail=f"No data at address {str(addr)}")

    # Fetch the media type
    media_type = await r.hget(addr.bytes, 'media_type')
    if not media_type:
        await close_redis(r)
        raise HTTPException(status_code=404, detail=f"No media type at address {str(addr)}")
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

    # Wrap text/ours if necessary
    if wrap:
        # TODO
        media_type = 'text/html'
        pass

    # Return the data
    return Response(data, media_type=media_type)

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
    return PlainTextResponse(str(exc), status_code=400)

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
