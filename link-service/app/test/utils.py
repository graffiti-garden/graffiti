import struct
import aiohttp
import base64
from time import time
from random import randbytes
from ..rest import put_metadata_format
from ..pubsub import RequestHeader, msg_header_format
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from contextlib import asynccontextmanager

URL_BASE = 'http://localhost:8000/'

def editor_public_private_keys(private_key=None):
    private_key = private_key if private_key else Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes_raw()
    return public_key, private_key

def generate_info_hash_and_pok(editor_public_key, uri_private_key=None):
    uri_private_key = uri_private_key if uri_private_key else Ed25519PrivateKey.generate()
    info_hash = uri_private_key.public_key().public_bytes_raw()
    pok = uri_private_key.sign(editor_public_key)
    return info_hash, pok, uri_private_key

async def put(
    editor_public_key,
    editor_private_key,
    version,
    info_hash,
    pok,
    counter,
    expiration,
    payload
):
    container = struct.pack(put_metadata_format,
        version,
        info_hash,
        pok, counter,
        expiration
    ) + payload

    container_signed = container + editor_private_key.sign(container)

    editor_public_key_base64 = base64.urlsafe_b64encode(editor_public_key).decode()

    url = f'{URL_BASE}{editor_public_key_base64}'

    async with aiohttp.ClientSession() as session:

        # Put the data
        async with session.put(
            url,
            data=container_signed) as response:

            return url, container_signed, response.status, await response.read()

async def put_simple(
    expiration=int(time()) + 100,
    counter=0,
    payload=None,
    editor_private_key=None,
    uri_private_key=None
):
    payload = payload if payload else randbytes(16)
    editor_public_key, editor_private_key = editor_public_private_keys(editor_private_key)
    info_hash, pok, uri_private_key = generate_info_hash_and_pok(editor_public_key, uri_private_key)
            
    url, container_signed, status, response = \
        await put(
            editor_public_key,
            editor_private_key,
            0,
            info_hash,
            pok,
            counter,
            expiration,
            payload
        )

    if status != 200:
        raise Exception(response)

    return editor_public_key, editor_private_key, info_hash, uri_private_key, container_signed

@asynccontextmanager
async def socket_connection():
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(URL_BASE) as ws:
            yield ws

async def subscribe_uris(ws, info_hashes, unsubscribe=False):
    request = RequestHeader.SUBSCRIBE if not unsubscribe else RequestHeader.UNSUBSCRIBE

    message_id = randbytes(16)
    await ws.send_bytes(struct.pack(
        msg_header_format,
        0,
        request.value,
        message_id
    ) + b''.join(info_hashes))

    return message_id
