import json
from uuid import uuid4
from os import getenv
from hashlib import sha256
from fastapi import APIRouter, Depends, HTTPException
from .auth import token_to_user
from .db import open_redis

router = APIRouter()

secret = getenv('SECRET')
max_recursion_depth = 10

def path_and_hash(path: str, user: str):
    # Make path into home directory
    if path[:2] != '~/':
        path = '~/' + path

    # If the input is a folder,
    # give the file a unique name
    if path[-1] == '/':
        path += str(uuid4())

    # Put the secret between the strings to
    # prevent ambiguity where they join and
    # also to prevent this function from being
    # publicly computable.
    inp = secret.join((path, user))

    # Return the updated path with the hash
    return path, sha256(inp.encode()).hexdigest()

@router.put('/put')
async def put(
        data: str, path: str,
        user: str = Depends(token_to_user)):

    # Make sure the data is valid JSON
    try:
        data = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Data is not valid json")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Data root is not a dictionary")

    # If the data already has an ID, remove it
    data.pop('id', None)

    # Expand the path and compute hash
    path, hash_ = path_and_hash(path, user)

    # Connect to the database
    r = await open_redis()

    # Store the data and user under the hash
    await r.hset('pod' + hash_, mapping={
        'data': json.dumps(data),
        'user': user
        })

    # Return both the private path and public hash
    return {'path': path, 'hash': hash_}

@router.post('/hash')
async def toHash(path: str, user: str = Depends(token_to_user)):
    _, hash_ = path_and_hash(path, user)
    return hash_

@router.get('/get')
async def get(path: str, user: str = Depends(token_to_user)):
    # Connect to the database and recursively
    # get the data, the data it references, etc.
    r = await open_redis()
    return await get_expand(path, r, False, user)

@router.get('/pod/{hash_}')
async def get_public(hash_: str):
    # Connect to the database and recursively
    # get the data, the data it references, etc.
    r = await open_redis()
    return await get_expand(hash_, r, True)

def iterate_pod_references(data, keys=()):
    # Recurse down to the leaves of a
    # data JSON blob. If a leaf is a string
    # starting with '~/' it is a reference
    # to a pod file, so add it to the iterator.
    if isinstance(data, dict):
        for k, v in data.items():
            yield from iterate_pod_references(v, keys + (k,))
    elif any(isinstance(data, t) for t in (list, tuple)):
        for i, v in enumerate(data):
            yield from iterate_pod_references(v, keys + (i,))
    elif isinstance(data, str):
        if data[:2] == '~/':
            yield keys, data

def set_nested_value(data, keys, value):
    # Set the value in a JSON blob located
    # at data[keys[0]][keys[1]][...]
    for key in keys[:-1]:
        data = data.setdefault(key, {})
    data[keys[-1]] = value

async def get_expand(id_: str, redis, public: bool, user: str = None, recursion_depth: int = 0):
    if public:
        # Use the hash as the public ID
        hash_ = id_
    else:
        # Expand the path and use it as the private ID
        id_, hash_ = path_and_hash(id_, user)

    # Stop infinite loops and 404's
    if recursion_depth > max_recursion_depth:
        return {'id': id_}
    if not await redis.hexists('pod' + hash_, 'user'):
        return {'id': id_}

    # Fetch and decode the data
    pod_contents = await redis.hgetall('pod' + hash_)
    data  = json.loads(pod_contents[b'data'])
    user = pod_contents[b'user'].decode()

    # Walk through all references to the pod and expand them
    for keys, path in iterate_pod_references(data):
        if public:
            # Compute the hash to get a public ID
            _, nested_id = path_and_hash(path, user)
        else:
            # Just use the path as the private ID
            nested_id = path
        nested_value = await get_expand(nested_id, redis, public, user, recursion_depth+1)
        set_nested_value(data, keys, nested_value)

    # Finally, set the id of the file to be updated
    data['id'] = id_
    return data
