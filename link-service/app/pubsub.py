import asyncio
import struct
from time import time
from enum import Enum
from fastapi import APIRouter, WebSocket
from contextlib import asynccontextmanager
from .db import db_connection

@asynccontextmanager
async def lifespan(router: APIRouter):
    router.subscriptions = {} # info_hash -> set(socket)
    asyncio.create_task(watch())
    yield

router = APIRouter(lifespan=lifespan)

@asynccontextmanager
async def register(socket):
    await socket.accept()
    socket.subscriptions = set()

    try:
        yield
    finally:
        unsubscribe_all(socket)
        try:
            await socket.close()
        except: pass
        
msg_header_format = '!BB16s'
msg_header_length = struct.calcsize(msg_header_format)

class RequestHeader(Enum):
    SUBSCRIBE   = 1
    UNSUBSCRIBE = 0

class ResponseHeader(Enum):
    ANNOUNCE         = 0
    SUCCESS          = 1
    ERROR_WITH_ID    = 2
    ERROR_WITHOUT_ID = 3

async def send_error(socket: WebSocket, message, message_id=None):
    if message_id:
        header = struct.pack('!B16s',
          ResponseHeader.ERROR_WITH_ID.value,
          message_id
        )
    else:
        header = struct.pack('!B',
          ResponseHeader.ERROR_WITHOUT_ID.value
        )

    await socket.send_bytes(header + message.encode())

@router.websocket("/")
async def stream(socket: WebSocket):
    async with register(socket):
        while True:
            try:
                msg = await socket.receive()
            except:
                break

            if msg["type"] != 'websocket.receive':
                break

            if 'bytes' not in msg:
                try:
                    await send_error(socket, 'expecting bytes')
                    continue
                except:
                    break

            msg = msg['bytes']

            if len(msg) < msg_header_length:
                try:
                    await send_error(socket, 'not enough data')
                finally:
                    break
        
            version, request, message_id = struct.unpack(
                msg_header_format,
                msg[:msg_header_length]
            ) 

            if version != 0:
                try:
                    await send_error(socket, 'this is version zero', message_id)
                    continue
                except:
                    break

            body = msg[msg_header_length:]

            if not len(body):
                try:
                    await send_error(socket, 'no info hash', message_id)
                    continue
                except:
                    break

            if len(body) % 32 != 0:
                try:
                    await send_error(socket, 'info hashes must each be exactly 32 bytes', message_id)
                    continue
                except:
                    break
            info_hashes = [body[i:i+32] for i in range(0, len(body), 32)]
            
            if request == RequestHeader.SUBSCRIBE.value:
                subscribe(socket, info_hashes)
            elif request == RequestHeader.UNSUBSCRIBE.value:
                unsubscribe(socket, info_hashes)
            else:
                try:
                    await send_error(socket, 'invalid request', message_id)
                    continue
                except:
                    break
            
            await socket.send_bytes(struct.pack('!B16s',
              ResponseHeader.SUCCESS.value,
              message_id
            ))

def subscribe(socket, info_hashes):
    for info_hash in info_hashes:
        socket.subscriptions.add(info_hash)
        if info_hash not in router.subscriptions:
            router.subscriptions[info_hash] = set()
        router.subscriptions[info_hash].add(socket)

    asyncio.create_task(process_existing(socket, info_hashes))

def unsubscribe(socket, info_hashes):
    for info_hash in info_hashes:
        if info_hash in socket.subscriptions:
            socket.subscriptions.remove(info_hash)
            router.subscriptions[info_hash].remove(socket)
            if not router.subscriptions[info_hash]:
                del router.subscriptions[info_hash]

def unsubscribe_all(socket):
    return unsubscribe(socket, socket.subscriptions.copy())

async def announce(socket, editor_public_key, container_signed):
    await socket.send_bytes(struct.pack('!B32s',
        ResponseHeader.ANNOUNCE.value,
        editor_public_key,
    ) + container_signed)

async def process_existing(socket, info_hashes):
    async for doc in db_connection().find({
        "info_hash": { "$in": info_hashes},
        "expiration": { "$gt": time() }
    }):
        try:
            await announce(socket, doc['editor_public_key'], doc['container_signed'])
        except:
            break

async def watch():
    async with db_connection().watch(
        [{'$match' : {}}], # Match all
        full_document='whenAvailable',
        full_document_before_change='whenAvailable'
    ) as stream:

        async for change in stream:

            socket_union = set()
            container_signed = b''
            editor_public_key = None

            for doc_state in ['fullDocumentBeforeChange', 'fullDocument']:
                if doc_state in change:
                    doc = change[doc_state]
                    info_hash = doc['info_hash']
                    editor_public_key = doc['editor_public_key']
                    if doc_state == 'fullDocument' and doc['expiration'] > time():
                        container_signed = doc['container_signed']
                    
                    # Get all the sockets subscibed to the
                    # new and old info hash, if they exist
                    if info_hash in router.subscriptions:
                        socket_union = socket_union.union(router.subscriptions[info_hash])

            if not editor_public_key: continue
                
            # Send the new document to all relevant info hashes.
            tasks = [announce(
                socket,
                editor_public_key,
                container_signed
            ) for socket in socket_union]

            # Send the changes (ignoring failed sends)
            await asyncio.gather(*tasks, return_exceptions=True)