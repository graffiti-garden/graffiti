import json
import asyncio
import bson
from uuid import uuid4
from os import getenv
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter, WebSocket
from .auth import token_to_user

router = APIRouter()

heartbeat_interval = float(getenv('QUERY_HEARTBEAT'))

# Connect to the database
client = AsyncIOMotorClient('mongo')
client.get_io_loop = asyncio.get_running_loop
db = client.test

@router.websocket("/query")
async def query(ws: WebSocket, token: str):

    # Validate and convert the token to a user id
    user = token_to_user(token)

    # Create a query object
    q = Query(user, ws)

    # Wait until it dies
    await q.heartbeat()


class Query:

    def __init__(self, user, ws):
        self.user = user
        self.ws = ws
        self.tasks = {}


    async def heartbeat(self):
        # Accept the connection
        await self.ws.accept()

        # Listen for messages
        self.tasks['listener'] = asyncio.create_task(self.listener())

        # Send a heartbeat
        while True:
            try:
                await self.ws.send_json("ping")
            except:
                self.cancel()
                break
            await asyncio.sleep(heartbeat_interval)


    async def listener(self):
        # Listen for updates
        while True:
            try:
                msg = await self.ws.receive_text()
            except:
                self.cancel()
                break
            await self.receive(msg)


    def cancel(self):
        # Kill all tasks
        for task in self.tasks.values():
            task.cancel()


    async def receive(self,  msg: str):
        # Make sure the message is valid json
        try:
            msg = json.loads(msg)
        except json.JSONDecodeError:
            return await self.error(f"Message is not JSON: {msg}")
        if not isinstance(msg, dict):
            return await self.error(f"Message is not an object: {msg}")

        # Parse what action it is performing
        if not 'action' in msg:
            return await self.error(f"Message does not specify an action: {msg}")
        if msg['action'] == 'add':
            return await self.add_query(msg['query'])
        elif msg['action'] == 'delete':
            return await self.del_query(msg['query_id'])
        else:
            return await self.error(f"Unrecognized action type in message: {msg}")


    async def add_query(self, query):
        # Make sure the query is valid
        if not isinstance(query, dict):
            return await self.error(f"Query is not an object: {query}")

        # Give the query a random ID
        query_id = str(uuid4())

        # Construct a modified query
        pipeline = [
            { "$match": {
                # The activity must match the query
                "fullDocument.activity": { "$elemMatch": query },
                # The near misses must NOT match the query
                "fullDocument.near_misses": { "$not": { "$elemMatch": query } },
                # The user must be the author, have access, or access must be open
                "$or": [
                    { "fullDocument.activity.signed": self.user },
                    { "fullDocument.access": self.user },
                    { "fullDocument.access": None }
                ]
            }}
        ]

        # Construct an iterator
        change_stream = db.activities.watch(
                pipeline,
                full_document='updateLookup',
                start_at_operation_time=bson.timestamp.Timestamp(0, 1)
                )

        async def task():
            async with change_stream as cs:
                async for change in cs:
                    await self.ws.send_json({
                        'query_id': query_id,
                        'activity': change['fullDocument']['activity'][0]
                    })

        self.tasks[query_id] = asyncio.create_task(task())

        # Send back an acknowledgment that the query has been added
        await self.ws.send_json({'type': 'QueryAdded', 'query_id': query_id, 'query': query})


    async def del_query(self, query_id):
        # Make sure the query_id exists
        if query_id not in self.tasks:
            self.error(f"Query is not running: {query_id}")

        # Cancel and delete
        self.tasks[query_id].cancel()
        del self.tasks[query_id]

        # Send an acknowledgment
        await self.ws.send_json({'type': 'QueryDeleted', 'query_id': query_id})


    async def error(self, detail):
        await self.ws.send_json({'type': 'Error', 'content': detail})
