import struct
import aiohttp
import base64
from ..rest import put_metadata_format
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

URL_BASE = 'http://localhost:8000/'

def editor_public_private_keys():
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes_raw()
    return public_key, private_key

def generate_info_hash_and_pok(editor_public_key):
    uri_private_key = Ed25519PrivateKey.generate()
    info_hash = uri_private_key.public_key().public_bytes_raw()
    pok = uri_private_key.sign(editor_public_key)
    return info_hash, pok

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
        pok,
        counter,
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

# async def put_link(
#     source,
#     payload,
#     expiration,
#     counter,
#     private_key=Ed25519PrivateKey.generate()
# ):
#     public_key, private_key = editor_public_private_keys()

#     uri_private_key = Ed25519PrivateKey.generate()
#     info_hash = uri_private_key.public_key().public_bytes_raw()
#     pok = uri_private_key.sign(editor_public_key)

#     await put(
#         public_key,
#         private_key,
#         0,
#         info_hash,
#         pok,
#         counter,
#         expiration,
#         payload
#     )

#     return private_key

# async def unpack_container(msg):
#     return editor_public_key, source, payload, expiration, counter