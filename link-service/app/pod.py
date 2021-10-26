from hashlib import sha256
from mimetypes import guess_type
from os import getenv
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File
from .login import token_to_user
from .db import open_redis

# TODO: give these scope

# TODO: make this actually secret
secret = "secret"

router = APIRouter(prefix='/pod')

def pathToHash(path: str, user: str = Depends(token_to_user)):
    # TODO: pad these to prevent ambiguity
    inp = path + user + secret
    return sha256(inp.encode()).hexdigest()

@router.put('/{path}')
async def put(
        path: str,
        hash_: str = Depends(pathToHash),
        data: UploadFile = File(...)):

    # Make sure it is a file name.
    if path[-1] == "/":
        raise HTTPException(status_code=400, detail="Cannot put a directory")

    # Connect to the database
    r = await open_redis()

    # Set the data
    media_type = guess_type(data.filename)[0]
    if not media_type:
        media_type = "application/octet-stream"
    await r.hset('pod' + hash_, 'media_type', media_type)
    datab = await data.read()
    await r.hset('pod' + hash_, 'data', datab)

    # TODO: Make it so the data can be ls'd

    return hash_

@router.get('/{path}')
async def get(hash_: str = Depends(pathToHash)):
    return await get_public(hash_)

@router.get('/public/{hash_}')
async def get_public(hash_: str):
    # Connect to the database
    r = await open_redis()

    # Check if the hash exists
    if not await r.hexists('pod' + hash_, 'data'):
        raise HTTPException(status_code=404, detail="Not found")

    # Fetch the data
    datab      =  await r.hget('pod' + hash_, 'data')
    media_type = (await r.hget('pod' + hash_, 'media_type')).decode()

    return Response(datab, media_type=media_type)

@router.delete('/{path}')
async def delete(hash_: str = Depends(pathToHash)):
    # Connect to the database
    r = await open_redis()

    # Check if the hash exists
    if not await r.hexists('pod' + hash_, 'data'):
        raise HTTPException(status_code=404, detail="Not Found")

    # Delete the data and mimetype
    await r.hdel('pod' + hash_, 'data', 'mimetype')

    return "Success"
