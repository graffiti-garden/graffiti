import json
import asyncio
import bson
from os import getenv
from fastapi import APIRouter, WebSocket
from .auth import token_to_user
from .db import get_db

heartbeat_interval = float(getenv('QUERY_HEARTBEAT'))

router = APIRouter()
db = get_db()

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
                await self.ws.send_json({'type': 'Ping'})
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


    async def receive(self,  msg_str: str):
        # Make sure the message is valid json
        try:
            msg = json.loads(msg_str)
        except json.JSONDecodeError:
            return await self.reject(f'"{msg_str}"', "Message is not JSON.")
        if not isinstance(msg, dict):
            return await self.reject(msg_str, "Message is not an object.")

        # Parse what action it is performing
        if not 'type' in msg:
            return await self.reject(msg_str, "Message does not specify a type.")

        if msg['type'] == 'Add':
            if not 'query' in msg:
                return await self.reject(msg_str, "A message of type 'Add' must have a query.")
            if not 'query_id' in msg:
                return await self.reject(msg_str, "A message of type 'Add' must have a query_id.")
            if (not 'timestamp' in msg) or (msg['timestamp'] is None):
                # Start queries at the beginning of time
                timestamp = bson.timestamp.Timestamp(0, 1)
            else:
                try:
                    timestamp = bson.timestamp.Timestamp(
                            msg['timestamp']['time'],
                            msg['timestamp']['inc']
                            )
                except:
                    return await self.reject(msg_str, f"Timestamp could not be parsed: {msg['timestamp']}")
            return await self.add_query(msg_str, msg['query'], msg['query_id'], timestamp)
        elif msg['type'] == 'Remove':
            if not 'query_id' in msg:
                return await self.reject(msg_str, "A message of type 'Remove' must have a query_id.")
            return await self.remove_query(msg['query_id'])
        else:
            return await self.reject(msg_str, "Message must have type 'Add' or 'Remove'.")


    async def add_query(self, msg_str, query, query_id, timestamp):
        # Make sure the query is valid
        if not isinstance(query, dict):
            return await self.reject(msg_str, f"query is not an object: {query}")

        # Make sure the query_id is a string
        if not isinstance(query_id, str):
            return await self.reject(msg_str, f"query_id is not a string: {query_id}")

        # If the query id already exists, stop it
        if query_id in self.tasks:
            self.kill_query(query_id)

        # Construct a modified query
        pipeline = [
            { "$match": {
                # The object must match the query
                "fullDocument.object": { "$elemMatch": query },
                # The near misses must NOT match the query
                "fullDocument.near_misses": { "$not": { "$elemMatch": query } },
                # The user must be the author, have access, or access must be open
                "$or": [
                    { "fullDocument.object.signed": self.user },
                    { "fullDocument.access": self.user },
                    { "fullDocument.access": None }
                ]
            }}
        ]

        # Construct an iterator
        change_stream = db.watch(
                pipeline,
                full_document='updateLookup',
                start_at_operation_time=timestamp
                )

        # Whenever a task is received, send it.
        async def task():
            async with change_stream as cs:
                async for change in cs:
                    await self.ws.send_json({
                        'type': 'Update',
                        'query_id': query_id,
                        'timestamp': {
                            'time': change['clusterTime'].time,
                            'inc':  change['clusterTime'].inc
                        },
                        'object': change['fullDocument']['object'][0],
                        'near_misses': change['fullDocument']['near_misses'],
                        'access': change['fullDocument']['access']
                    })
        self.tasks[query_id] = asyncio.create_task(task())

        # Send back an acknowledgment that the query has been added
        await self.accept(msg_str)


    async def remove_query(self, msg_str, query_id):
        # Make sure the query_id is a string
        if not isinstance(query_id, str):
            return await self.reject(msg_str, f"query_id is not a string: {query_id}")

        # Make sure the query_id exists
        if query_id not in self.tasks:
            self.reject(f"query has not been added: {query_id}")

        # Cancel and delete
        self.kill_query(query_id)

        # Send an acknowledgment
        await self.accept(msg_str)

    def kill_query(self, query_id):
        self.tasks[query_id].cancel()
        del self.tasks[query_id]

    async def reply(self, type_, msg_str, content=""):
        if content:
            content = f', "content": "{content}"'
        await self.ws.send_text(f'{{"type": "{type_}", "object": {msg_str}{content}}}')

    async def reject(self, msg_str, content):
        await self.reply('Reject', msg_str, content)

    async def accept(self, msg_str):
        await self.reply('Accept', msg_str)
