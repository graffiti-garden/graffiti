#!/usr/bin/env python3

import asyncio
import uuid
from uuid import UUID
import aioredis
import uvicorn
import mimetypes
from typing import Optional, Set
from fastapi import FastAPI, Request, WebSocket, Response, HTTPException, File, Form, UploadFile
from fastapi.responses import PlainTextResponse, HTMLResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from werkzeug.http import parse_accept_header
from werkzeug.datastructures import MIMEAccept
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# The rate that websockets are kept alive
PING_PONG_INTERVAL = 2
CHILDREN_INTERVAL = 5

app = FastAPI(default_response_class=PlainTextResponse)

# Serve javascript files
app.mount("/js", StaticFiles(directory="js"), name="js")

# Serve wrapped HTML files
templates = Jinja2Templates(directory="templates")
wrapper = templates.get_template("wrapper.html")

# Add the text/our mimetype
mimetypes.add_type('text/our', '.our')

@app.post('/')
async def add_media(
        data: UploadFile = File(...),
        parents: Optional[Set[UUID]] = Form({}),
        # TODO:
        # signature(s?)
        # time stamps?
        # semantics?
        ):

    # Read the data
    datab = await data.read()

    # Get the media type
    media_type = mimetypes.guess_type(data.filename)[0]
    if media_type is None:
        media_type = 'application/octet-stream'

    # Compute the address
    addr = uuid.uuid5(uuid.NAMESPACE_URL,
            str(datab) + \
            media_type + \
            ''.join([str(p) for p in parents])
            )

    # See if the media already exists
    r = await open_redis()
    if await r.hexists(addr.bytes, 'data'):
        await close_redis(r)
        return str(addr)

    # If not, add it
    await r.hset(addr.bytes, 'media_type', media_type.encode())
    await r.hset(addr.bytes, 'data', datab)

    # Add the children to the parents
    # and vice versa
    for parent in parents:
        await r.xadd(parent.bytes + b'c', {b'c': addr.bytes})
        await r.xadd(addr.bytes + b'p', {b'p': parent.bytes})
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
    if 'accept' in request.headers:
        accept_str = request.headers['accept']
    else:
        accept_str = '*/*'
    accept = parse_accept_header(accept_str, MIMEAccept)
    wrap = False
    if 'text/our' in media_type:
        media_type = accept.best_match([media_type, 'text/html'])
        wrap = (media_type == 'text/html')
    if media_type not in accept:
        await close_redis(r)
        raise HTTPException(status_code=406, detail=f"\"{media_type}\" not accepted by \"{accept_str}\"")

    # Fetch the data
    data = await r.hget(addr.bytes, 'data')
    await close_redis(r)

    # Wrap text/ours if necessary
    if wrap:
        text = data.decode(errors='replace')
        html = wrapper.render(body=text, addr=str(addr))
        data = html.encode()

    # Return the data
    return Response(data, media_type=media_type)

@app.websocket("/{addr}")
async def get_children(ws: WebSocket, addr: UUID):
    # Open the websocket connection
    await ws.accept()
    r = await open_redis()

    # Fetch ancient children
    latest_id = '0'

    # Check that the socket is still alive
    while await is_websocket_active(ws):

        # Wait for new children
        events = await r.xread([addr.bytes + b'c'],
                               latest_ids=[latest_id],
                               timeout=CHILDREN_INTERVAL)

        # Send the children
        for _, e_id, e in events:
            latest_id = e_id
            child = UUID(bytes=e[b'c'])
            try:
                await ws.send_text(str(child))
            except:
                break

    await close_redis(r)

async def is_websocket_active(ws: WebSocket) -> bool:
    try:
        await ws.send_text('ping')
        message = await asyncio.wait_for(ws.receive_text(), PING_PONG_INTERVAL)
    except:
        return False
    return message == 'pong'

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
