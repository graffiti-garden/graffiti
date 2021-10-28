from hashlib import sha256
from fastapi import APIRouter, Depends
from .auth import token_to_user
from .db import open_redis

router = APIRouter()

def stage_action_to_uuid(stage: str, action: str):
    # Concatenate the hashes of the stage and action
    # This prevents trickiness where
    # stage+action is ambiguous
    stage_hash  = sha256( stage.encode()).digest()
    action_hash = sha256(action.encode()).digest()
    return stage_hash + action_hash

@router.post('/perform')
async def perform(
        stage: str, action: str,
        user = Depends(token_to_user)):

    # Get a unique performance ID that
    # describes the stage/action pair
    per = stage_action_to_uuid(stage, action)

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock(b'loc' + per)
    await lock.acquire()

    # If no user is already performing
    if await r.scard(b'per' + per) == 0:
        # Add it to the stream
        xid = await r.xadd('stg' + stage, {'act': action})
        # Map the performance to its
        # stream ID so it can be deleted.
        await r.hset(b'xid' + per, 'xid', xid)

    # Add the user to the performance
    await r.sadd(b'per' + per, user)

    # Release
    await lock.release()
    return "Success"

@router.post('/retire')
async def retire(
        stage: str, action: str,
        user = Depends(token_to_user)):

    # Get a unique performance id that
    # describes the stage/action pair
    per = stage_action_to_uuid(stage, action)

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock(b'loc' + per)
    await lock.acquire()

    # Remove the user from the performance
    await r.srem(b'per' + per, user)

    # If no user is performing
    # remove the performance from the stream
    if await r.scard(b'per' + per) == 0:
        # Get the stream ID of the performance
        xid = await r.hget(b'xid' + per, 'xid')
        if xid:
            # Remove it from the stream
            await r.xdel('stg' + stage, xid)
            await r.hdel(b'xid' + per, 'xid')

    # Release
    await lock.release()
    return "Success"
