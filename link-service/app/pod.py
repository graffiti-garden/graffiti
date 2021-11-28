import json
import time
from os import getenv
from hashlib import sha256
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from .auth import token_to_user
from .db import open_redis

router = APIRouter()

secret = getenv('SECRET')

@router.post('/put')
async def put(data: str, user: str = Depends(token_to_user)):
    return await put_with_metadata(data, user)

async def put_with_metadata(
        data: str,
        user: str = Depends(token_to_user),
        stage: Optional[str] = None,
        recipients: Optional[List] = []
        ):

    # Connect to the database
    r = await open_redis()

    # Make sure the object is valid JSON
    try:
        data = json.loads(data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Data is not valid json")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Data root is not a dictionary")

    # Prevent forgery
    for key in ['signed', 'time', 'at', 'to', 'id']:
        if key in data:
            raise HTTPException(
                    status_code=400,
                    detail=f"'{key}' is a protected field")

    # Sign and date
    data['signed'] = user
    data['time'] = time.time_ns()

    # Add performance data, if relevant
    if stage:
        data['at'] = stage
    if recipients:
        for recipient in recipients:
            try:
                assert len(recipient) == 64
                int(recipient, 16)
            except (AssertionError, ValueError):
                HTTPException(
                    status_code=400, 
                    detail=f"{recipient} is not a valid recipient")
        data['to'] = recipients

    # Turn it back into a string
    data = json.dumps(data)

    # Compute the hash
    hash_ = sha256((data + secret).encode()).hexdigest()

    # Store the data and under the hash and return it
    await r.hset('pod' + hash_, 'data', data)
    return hash_

@router.get('/get')
async def get(hash_: str, user: str = Depends(token_to_user)):
    # Connect to the database
    r = await open_redis()

    # Make sure the data exists
    if not await r.hexists('pod' + hash_, 'data'):
        raise HTTPException(status_code=404)

    # If it does, read and parse
    data = await r.hget('pod' + hash_, 'data')
    data = json.loads(data)

    # Add it's own ID
    data['id'] = hash_
    return data
