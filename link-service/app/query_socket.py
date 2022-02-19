import asyncio
from os import getenv
from fastapi import APIRouter, Depends, WebSocket, HTTPException, Body
from uuid import uuid4
from .auth import token_to_user
from .db import get_db

heartbeat_interval = float(getenv('QUERY_HEARTBEAT'))

router = APIRouter()

@router.on_event("startup")
async def start_query_sockets():
    db = await get_db()
    global qsm
    qsm = QuerySocketMessenger(db)

@router.post('/add_socket_queries')
async def add_socket_queries(
        queries: dict[str, dict],
        socket_id: str = Body(...),
        user: str = Depends(token_to_user)):

    try:
        time = await qsm.add_queries(socket_id, queries, user)
        return {'type': 'Accept', 'time': time}
    except Exception as e:
        raise HTTPException(status=400, detail=str(e))

@router.post('/remove_socket_queries')
async def remove_socket_queries(
        query_ids: list[str],
        socket_id: str = Body(...),
        user: str = Depends(token_to_user)):

    try:
        time = await qsm.remove_queries(socket_id, query_ids, user)
        return {'type': 'Accept', 'time': time}
    except Exception as e:
        raise HTTPException(status=400, detail=str(e))

@router.websocket("/query_socket")
async def query(ws: WebSocket, token: str):
    # Validate and convert the token to a user id
    user = token_to_user(token)

    # Open a query socket
    qs = QuerySocket(user, ws)

    # Wait until it dies
    await qs.heartbeat()

class QuerySocket:

    def __init__(self, user, ws):
        self.user = user
        self.ws = ws
        self.alive = True
        self.id = str(uuid4())

    async def send_msg(self, msg):
        if self.alive:
            try:
                await self.ws.send_json(msg)
            except Exception as e:
                await qsm.remove_socket(self)
                self.alive = False

    async def heartbeat(self):
        # Accept the connection
        await self.ws.accept()

        # Register ourselves with the query process
        await qsm.add_socket(self)

        # Send a heartbeat
        while self.alive:
            await self.send_msg({
                'type': 'Ping',
                'socket_id': self.id
                })
            await asyncio.sleep(heartbeat_interval)

    async def match(self, query_id, doc):
        await self.send_msg({
            'type': 'Update',
            'query_id': query_id,
            'object': doc['object'][0],
            'near_misses': doc['near_misses'],
            'access': doc['access']
        })

    async def error(self, query_id, detail):
        await self.send_msg({
            'type': 'Reject',
            'query_id': query_id,
            'content': detail
        })

"""
Listens to changes in the database and
pushes those to appropriate sockets.
"""
class QuerySocketMessenger:

    def __init__(self, db):
        self.db = db
        self.query_lock = asyncio.Lock()
        self.queries = {}
        self.sockets = {}
        self.latest_time = 0

        asyncio.create_task(self.watch())

    async def watch(self):
        # Listen to all changes to the database
        watcher = self.db.watch(
                [{ "$match": {} }],
                full_document='updateLookup'
                )

        # For each new change to the database
        async with watcher as change_stream:
            async for change in change_stream:
                obj = change['fullDocument']['object'][0]

                # Freeze updates to the queries
                async with self.query_lock:

                    # Update the latest time seen
                    self.latest_time = max(self.latest_time, obj['created'])

                    # See if the changed object matches any of the open queries
                    await self.match_object_to_open_queries(obj['uuid'])

    async def match_object_to_open_queries(self, object_id):

        # For all open queries
        for socket_id in self.queries:
            for query_id in self.queries[socket_id]:

                # Check to see if the query matches
                # the document containing the changed object.
                try:
                    query = self.queries[socket_id][query_id]
                    doc = await self.db.find_one({
                        # The object must be the one that is changing
                        "object.uuid": object_id,
                        # The object must match the query
                        "object": { "$elemMatch": query },
                        # The near misses must NOT match the query
                        "near_misses": { "$not": { "$elemMatch": query } },
                        # The user must be the author, have access, or access must be open
                        "$or": [
                            { "object.signed": self.sockets[socket_id].user },
                            { "access": self.sockets[socket_id].user },
                            { "access": None }
                        ]
                    })
                except Exception as e:
                    # There's an error with the query!
                    await self.remove_queries(socket_id, [query_id], self.sockets[socket_id].user)
                    await self.sockets[socket_id].error(query_id, str(e))
                    continue

                # If there's a match, send it to the relevant socket
                if doc is not None:
                    await self.sockets[socket_id].match(query_id, doc)

    async def add_socket(self, socket):
        async with self.query_lock:
            self.sockets[socket.id] = socket
            self.queries[socket.id] = {}

    async def remove_socket(self, socket):
        async with self.query_lock:
            del self.sockets[socket.id]
            del self.queries[socket.id]

    async def add_queries(self, socket_id, queries, user):
        async with self.query_lock:
            self.validate_socket(socket_id, user)
            for query_id in queries:
                self.queries[socket_id][query_id] = queries[query_id]
            return self.latest_time

    async def remove_queries(self, socket_id, query_ids, user):
        async with self.query_lock:
            self.validate_socket(socket_id, user)
            for query_id in query_ids:
                del self.queries[socket_id][query_id]
            return self.latest_time

    def validate_socket(self, socket_id, user):
        if self.sockets[socket_id].user != user:
            raise RuntimeError(f'socket_id, "{socket_id}", is not owner by user "{user}"')
