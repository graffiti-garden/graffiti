import json
from fastapi import APIRouter, Depends, HTTPException
from .auth import token_to_user
from .db import open_redis, strings_to_hash

router = APIRouter(prefix='/pod')

def path_to_hash(path: str, user: str = Depends(token_to_user)):
    return strings_to_hash([path, user]).hex()

@router.put('/{path:path}')
async def put(
        path: str, data: str,
        hash_: str = Depends(path_to_hash)):

    # Make sure it is a file name.
    if path[-1] == "/":
        raise HTTPException(status_code=400, detail="Cannot put a directory")

    # Make sure the data is valid JSON
    try:
        json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Data is not valid json")

    # Connect to the database
    r = await open_redis()

    # Set the data
    await r.hset('pod' + hash_, 'data', data)

    # Return public URL
    return {'hash': hash_}

@router.get('/{path:path}')
async def get(hash_: str = Depends(path_to_hash)):
    return await get_public(hash_)

@router.get('/public/{hash_}')
async def get_public(hash_: str):
    # Connect to the database
    r = await open_redis()

    # Check if the hash exists
    if not await r.hexists('pod' + hash_, 'data'):
        raise HTTPException(status_code=404, detail="Not found")

    # Fetch and decode the data
    data =  await r.hget('pod' + hash_, 'data')
    return json.loads(data)

@router.delete('/{path:path}')
async def delete(hash_: str = Depends(path_to_hash)):
    # Connect to the database
    r = await open_redis()

    # Check if the hash exists
    if not await r.hexists('pod' + hash_, 'data'):
        raise HTTPException(status_code=404, detail="Not Found")

    # Delete the data
    await r.hdel('pod' + hash_, 'data')
    return "Success"
