from fastapi import APIRouter, Depends, HTTPException
from .auth import token_to_user
from .db import open_redis
from .pod import put, get

router = APIRouter()

def stage_to_path(stage: str):
    return f"~/performances/{stage}/"

@router.post('/perform')
async def perform(
        action: str, stage: str,
        user = Depends(token_to_user)):

    # Store the performance in the pod
    path = stage_to_path(stage)
    pod_id = await put(action, path, user)
    hash_ = pod_id['hash']

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock('lock' + hash_)
    await lock.acquire()

    # Find out whether it is already in the stream
    xid = await r.hget('performance' + hash_, 'xid')
    if not xid:
        # Add the performance to a stream
        xid = await r.xadd('stage' + stage, pod_id)
        await r.hset('performance' + hash_, mapping={
            'xid': xid,
            'stage': stage
            })

    # Return the result
    await lock.release()
    return pod_id

@router.post('/retire')
async def retire(
        hash_: str,
        user = Depends(token_to_user)):

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock('lock' + hash_)
    await lock.acquire()

    # Find out whether it is already in the stream
    xid = await r.hget('performance' + hash_, 'xid')
    if xid:
        # If it is, remove it from the stream
        stage = await r.hget('performance' + hash_, 'stage')
        await r.xdel(b'stage' + stage, xid)
        await r.hdel('performance' + hash_, 'xid', 'stage')
    else:
        await lock.release()
        raise HTTPException(status_code=404)

    # Release
    await lock.release()
    return "Success"
