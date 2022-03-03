import asyncio
from .rewrite import query_rewrite

"""
Listens to changes in the database and
pushes those to appropriate sockets.
"""

class QueryBroker:

    def __init__(self, db):
        self.db = db
        self.query_lock = asyncio.Lock()
        self.sockets = {} # socket_id -> socket
        self.queries = {} # socket_id -> {query_id -> query}

    async def change(self, object_id, delete=False):

        # Freeze updates to the queries
        async with self.query_lock:

            # Keep track of bad queries we'll have to delete
            malformed_queries = []

            deletions = []
            updates = []

            # For all open queries
            for socket_id in self.queries:
                for query_id in self.queries[socket_id]:

                    # Check to see if the query matches
                    # the document containing the changed object.
                    try:
                        query = self.queries[socket_id][query_id]
                        # Only run the query on the object that is changing
                        query["object.id"] = object_id
                        doc = await self.db.find_one(query)
                    except Exception as e:
                        # There's an error with the query!
                        malformed_queries.append((socket_id, query_id))
                        # And send the error to the socket
                        await self.sockets[socket_id].error(query_id, str(e))
                        continue

                    # If there's a match
                    if doc is not None:
                        # Keep track of updates or deletions, depending
                        if delete:
                            deletions.append((socket_id, query_id, object_id))
                        else:
                            updates.append((socket_id, query_id, doc))

            # Delete all the bad queries
            for socket_id, query_id in malformed_queries:
                del self.queries[socket_id][query_id]

        # Push the updates (do this afterwards to avoid locking)
        for socket_id, query_id, object_id in deletions:
            if socket_id in self.sockets:
                await self.sockets[socket_id].delete(query_id, object_id)
        for socket_id, query_id, doc in updates:
            if socket_id in self.sockets:
                await self.sockets[socket_id].update(query_id, doc)

    async def add_socket(self, socket):
        async with self.query_lock:
            self.sockets[socket.id] = socket
            self.queries[socket.id] = {}

    async def remove_socket(self, socket):
        async with self.query_lock:
            del self.sockets[socket.id]
            del self.queries[socket.id]

    async def add_query(self, socket_id, query_id, query, signature):
        async with self.query_lock:
            self.validate_socket(socket_id, signature)
            self.queries[socket_id][query_id] = query_rewrite(query, signature)

    async def remove_query(self, socket_id, query_id, signature):
        async with self.query_lock:
            self.validate_socket(socket_id, signature)
            del self.queries[socket_id][query_id]

    def validate_socket(self, socket_id, signature):
        if self.sockets[socket_id].signature != signature:
            raise RuntimeError(f'socket_id, "{socket_id}", is not owned by "{signature}"')
