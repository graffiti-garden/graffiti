from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from .auth import token_to_user
from .db import open_redis
from .pod import put_with_metadata

router = APIRouter()

@router.post('/perform')
async def perform(
        action: str,
        stage: str,
        recipients: Optional[List] = [],
        user: str = Depends(token_to_user)
        ):

    # Store the performance in the pod
    hash_ = await put_with_metadata(action, user, stage, recipients)

    # Connect to the database and lock
    r = await open_redis()

    # Add it to the stream
    # (Note because messages are signed and
    #  stamped to the nanosecond, there is no
    #  chance of double counting in this implementation)
    xid = await r.xadd('stage' + stage, {'hash': hash_})
    await r.hset('performance' + hash_, mapping={
        'xid': xid,
        'stage': stage
        })

    return hash_

@router.post('/retire')
async def retire(
        hash_: str,
        user = Depends(token_to_user)):

    # Connect to the database
    r = await open_redis()

    # Find out whether it is already in the stream
    xid = await r.hget('performance' + hash_, 'xid')
    if xid:
        # If it is, remove it from the stream
        stage = await r.hget('performance' + hash_, 'stage')
        await r.xdel(b'stage' + stage, xid)
        await r.hdel('performance' + hash_, 'xid', 'stage')
    else:
        raise HTTPException(status_code=404)

    return "Success"
