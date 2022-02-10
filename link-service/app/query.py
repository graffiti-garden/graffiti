import json
import asyncio
import bson
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .auth import token_to_user

router = APIRouter()

# Connect to the database
client = AsyncIOMotorClient('mongo')
client.get_io_loop = asyncio.get_running_loop
db = client.test

@router.websocket("/query")
async def query(ws: WebSocket, token: str, query: str):

    # Validate and convert the token to a user id
    user = token_to_user(token)

    # Make sure the query is valid json
    try:
        query = json.loads(query)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {query}")
    if not isinstance(query, dict):
        raise HTTPException(status_code=400, detail=f"JSON root is not a dictionary: {query}")

    # Accept the connection
    await ws.accept()

    # Construct a modified query
    pipeline = [
        { "$match": {
            # The activity must match the query
            "fullDocument.activity": { "$elemMatch": query },
            # The near misses must NOT match the query
            "fullDocument.near_misses": { "$not": { "$elemMatch": query } },
            # The user must be the author, have access, or access must be open
            "$or": [
                { "fullDocument.activity.signed": user },
                { "fullDocument.access": user },
                { "fullDocument.access": None }
            ]
        }}
    ]

    # Start time at the beginning
    start_watch_time = bson.timestamp.Timestamp(0, 1)

    # Watch for activities that match the pipeline
    while True:
        async with db.activities.watch(
                pipeline,
                full_document='updateLookup',
                start_at_operation_time=start_watch_time
                ) as change_stream:

            change_stream_iter = change_stream.__aiter__()
            try:
                while True:
                    # Don't wait too long before moving on
                    change = await asyncio.wait_for(
                            change_stream_iter.__anext__(),
                            timeout=2)

                    # Next iteration of watch, look for posts after this time
                    current_time = change['clusterTime']
                    start_watch_time = bson.timestamp.Timestamp(current_time.time, current_time.inc+1)

                    # Send the message
                    await ws.send_json(change['fullDocument']['activity'][0])

            except asyncio.TimeoutError as e:
                # If we timed out, send a ping just
                # to make sure the connection is still alive
                await ws.send_json("I timed out, try again")

    await ws.close()
