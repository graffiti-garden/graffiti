from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from .auth import token_to_user
from .db import open_redis

router = APIRouter()

# What should the stage be?
# Simply a string? 
# How should the personal thing be attached to it.
# I want the 

async def perform_personal(
        activity,
        stage: str, # a string representing anything
        recipients,
        user):

    return performance uri AND the stage uri


@router.post('/perform')
async def perform(
        activity: str, # json
        stage: str, # a string or a uri
        personal: bool, # if the stage is a personal one or not.
        recipients: Optional[List] = [],
        user: str = Depends(token_to_user)
        ):

    # Make sure the activity is valid JSON
    try:
        activity = json.loads(activity)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Activity is not valid json")
    if not isinstance(activity, dict):
        raise HTTPException(status_code=400, detail="Activity root is not a dictionary")

    # Convert the stage to valid json
    # sign it if necessary
    # convert back and hash

    # Prevent forgery
    for key in ['signed', 'time', 'at', 'to', 'uri']:
        if key in activity:
            raise HTTPException(
                    status_code=400,
                    detail=f"'{key}' is a protected field")

    # Sign, date and place
    activity['signed'] = user
    activity['time'] = time.time_ns()
    activity['at'] = stage

    # If the activity has recipients, add them
    if recipients:
        for recipient in recipients:
            try:
                assert len(recipient) == 64
                int(recipient, 16)
            except (AssertionError, ValueError):
                HTTPException(
                    status_code=400, 
                    detail=f"{recipient} is not a valid recipient")
        activity['to'] = recipients

    # Turn it back into a string
    activity = json.dumps(activity)

    # Compute the hash
    uri = sha256((activity + secret).encode()).hexdigest()

    # Connect to the database
    r = await open_redis()

    # Add it to the stream
    xid = await r.xadd('stage' + stage, {'uri': uri})

    # Store the activity and stream ID under the uri
    await r.hset('performance' + uri, mapping={
        'activity': activity,
        'stage': stage,
        'xid': xid,
        'user': user
        })

    return uri

@router.post('/retire')
async def retire(
        uri: str,
        user = Depends(token_to_user)):

    # Connect to the database
    r = await open_redis()

    # Find out whether it is already in the stream
    performance = await r.hgetall('performance' + uri)
    if not performance:
        raise HTTPException(status_code=404)

    # Make sure there is permission
    if performance['user'] != user.encode():
        raise HTTPException(status_code=406)

    # Remove it from the stream
    await r.xdel(b'stage' + performance['stage'], xid)

    # And remove all fields
    await r.hdel('performance' + uri,
            'xid',
            'stage',
            'activity',
            'user')

    return "Success"
