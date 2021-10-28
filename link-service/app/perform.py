import json
from hashlib import sha256
from fastapi import APIRouter, Depends
from .auth import token_to_user
from .db import open_redis

router = APIRouter()

def stage_action_to_id(stage: str, action: str):
    # Concatenate the hashes of the stage and action
    # This prevents trickiness where
    # stage+action is ambiguous
    stage_hash  = sha256( stage.encode()).digest()
    action_hash = sha256(action.encode()).digest()
    return stage_hash + action_hash

@router.post('/perform')
async def perform(
        stage: str, action: str,
        perform_id = Depends(stage_action_to_id),
        user = Depends(token_to_user)):

    # Make sure the action is valid JSON
    try:
        json.loads(action)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Action is not valid json.")

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock(b'loc' + perform_id)
    await lock.acquire()

    # If no user is already performing
    if await r.scard(b'per' + perform_id) == 0:
        # Add it to the stream
        xid = await r.xadd('stg' + stage, {'action': action})
        # Map the performance to its
        # stream ID so it can be deleted.
        await r.hset(b'xid' + perform_id, 'xid', xid)

    # Add the user to the performance
    await r.sadd(b'per' + perform_id, user)

    # Release
    await lock.release()
    return "Success"

@router.post('/retire')
async def retire(
        stage: str, action: str,
        perform_id = Depends(stage_action_to_id),
        user = Depends(token_to_user)):

    # Connect to the database and lock
    r = await open_redis()
    lock = r.lock(b'loc' + perform_id)
    await lock.acquire()

    # Remove the user from the performance
    await r.srem(b'per' + perform_id, user)

    # If no user is performing
    # remove the performance from the stream
    if await r.scard(b'per' + perform_id) == 0:
        # Get the stream ID of the performance
        xid = await r.hget(b'xid' + perform_id, 'xid')
        if xid:
            # Remove it from the stream
            await r.xdel('stg' + stage, xid)
            await r.hdel(b'xid' + perform_id, 'xid')

    # Release
    await lock.release()
    return "Success"
