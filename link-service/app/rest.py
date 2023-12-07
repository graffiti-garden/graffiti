import struct
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from .db import db_connection

class ByteResponse(Response):
    media_type = "application/octet-stream"
    def render(self, content: bytes) -> bytes:
        return content

router = APIRouter()

def decode_editor_public_key(editor_public_key_base64):
    # Convert the editor public key to bytes
    try:
        editor_public_key = base64.urlsafe_b64decode(editor_public_key_base64)
    except Exception as e:
        raise HTTPException(422, 'public key is not correctly base 64 encoded')

    # and make sure it is a 32 byte Ed25519 public key
    if len(editor_public_key) != 32:
        raise HTTPException(422, 'public key must be exactly 32 bytes long')

    return editor_public_key

@router.get('/{editor_public_key_base64}')
async def get(
    editor_public_key: bytes = Depends(decode_editor_public_key),
    db=Depends(db_connection)):

    result = await db.find_one({
        "editor_public_key": editor_public_key,
    })

    if result:
        return ByteResponse(result['container_signed'])
    else:
        raise HTTPException(404, 'link not found')

put_metadata_format = '!B32s64sqq'
put_metadata_length = struct.calcsize(put_metadata_format)
signature_length = 64
payload_max_length = 256

@router.put('/{editor_public_key_base64}')
async def put(
    request: Request,
    editor_public_key: bytes = Depends(decode_editor_public_key),
    db=Depends(db_connection)):

    # Get the body as raw bytes
    container_signed: bytes = await request.body()
    if len(container_signed) < put_metadata_length + signature_length:
        raise HTTPException(422, "not enough data")
    if len(container_signed) > put_metadata_length + signature_length + payload_max_length:
        raise HTTPException(413, 'payload cannot exceed 256 bytes')

    # Unpack the metadata from the block of the container...

    # The 64 byte Ed25519 signature is at the end
    container, signature = container_signed[:-signature_length], container_signed[-signature_length:]

    # A bunch of data is packed into the beginning:
    # version:             2 byte unsigned short
    # info_hash:          32 byte Ed25519 public key
    # proof_of_knowledge: 64 byte Ed25519 signature
    # counter              8 byte signed long long
    # expiration           8 byte signed long long
    version, info_hash, proof_of_knowledge, counter, expiration\
    = struct.unpack(
        put_metadata_format,
        container[:put_metadata_length]
    )

    if version > 0:
        raise HTTPException(400, 'this is version zero')

    # The payload is the middle rest of the container
    payload = container[put_metadata_length:]

    # Verify the editor's signature
    editor_public_key_obj = Ed25519PublicKey.from_public_bytes(editor_public_key)
    try:
        editor_public_key_obj.verify(signature, container)
    except:
        raise HTTPException(401, 'invalid signature')

    # Verify that the editor knows the URI
    # that the info hash is derived from.
    #
    # To do this, the URI is used as a private key
    # and the info_hash is the derived public key.
    # Using the URI-private-key to sign a message containing
    # the editor's public key is sufficient to prove the editor
    # know's the URI (or they don't but someone who does is granting
    # them the capability to create a post at the info_hash)
    info_hash_as_public_key = Ed25519PublicKey.from_public_bytes(info_hash)
    try:
        info_hash_as_public_key.verify(proof_of_knowledge, editor_public_key)
    except:
        raise HTTPException(401, 'invalid proof of knowledge')

    # We will update the link, only if the provided counter
    # exceeds the existing counter (if one exists), and
    # if the provided expiration equals or exceeds the
    # existing expiration.
    #
    # Because of the way mongo works, this condition needs to
    # be copied over multiple times, so here is a helper function
    # for it.
    def conditional_field(name, variable):
        return {
            name: {
                "$cond": {
                    "if": {
                        "$and": [{
                            # The old counter is less than the new
                            "$lt": ["$counter", counter]
                        }, {
                            # The old expiration is less than
                            # or equal to the new
                            "$lte": ["$expiration", expiration]
                        }]
                    },
                    "then": variable,
                    "else": f"${name}"
                },
            }
        }

    # Apply the mongo update
    existing = await db.find_one_and_update({
        "editor_public_key": editor_public_key,
    }, [{
        "$set": { "editor_public_key": editor_public_key } |
        conditional_field("counter", counter) |
        conditional_field("expiration", expiration) |
        conditional_field("info_hash", info_hash) |
        conditional_field("container_signed", container_signed)
    }], upsert=True)

    if existing:
        if existing['counter'] >= counter:
            raise HTTPException(409, 'counter must increase')
        elif existing['expiration'] > expiration:
            raise HTTPException(409, 'expiration cannot decrease')
        else:
            return ByteResponse(existing['container_signed'])
    else:
        return ByteResponse(None)