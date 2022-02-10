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

    # Make sure the token is valid
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

    async with db.activities.watch(\
            pipeline,\
            full_document='updateLookup',\
            start_at_operation_time=bson.timestamp.Timestamp(0, 1)\
            ) as change_stream:
        async for change in change_stream:
            await ws.send_json(change['fullDocument']['activity'][0])
