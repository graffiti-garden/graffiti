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
        self.latest_time = 0

    async def change(self, object_id, delete=False):

        # Freeze updates to the queries
        async with self.query_lock:

            # Keep track of bad queries we'll have to delete
            malformed_queries = []

            # For all open queries
            for socket_id in self.queries:
                for query_id in self.queries[socket_id]:

                    # Check to see if the query matches
                    # the document containing the changed object.
                    try:
                        query = self.queries[socket_id][query_id]
                        # Only run the query on the object that is changing
                        query["object.uuid"] = object_id
                        doc = await self.db.find_one(query)
                    except Exception as e:
                        # There's an error with the query!
                        malformed_queries.append((socket_id, query_id))
                        # And send the error to the socket
                        await self.sockets[socket_id].error(query_id, str(e))
                        continue

                    # If there's a match
                    if doc is not None:
                        # Either send a document update or deletion, depending
                        if delete:
                            await self.sockets[socket_id].delete(query_id, object_id)
                        else:
                            self.latest_time = max(self.latest_time, doc['object'][0]['created'])
                            await self.sockets[socket_id].update(query_id, doc)

            # Delete all the bad queries
            for socket_id, query_id in malformed_queries:
                del self.queries[socket_id][query_id]

    async def add_socket(self, socket):
        async with self.query_lock:
            self.sockets[socket.id] = socket
            self.queries[socket.id] = {}

    async def remove_socket(self, socket):
        async with self.query_lock:
            del self.sockets[socket.id]
            del self.queries[socket.id]

    async def add_query(self, socket_id, query_id, query, user):
        async with self.query_lock:
            self.validate_socket(socket_id, user)
            self.queries[socket_id][query_id] = query_rewrite(query, user)
            return self.latest_time

    async def remove_query(self, socket_id, query_id, user):
        async with self.query_lock:
            self.validate_socket(socket_id, user)
            del self.queries[socket_id][query_id]
            return self.latest_time

    def validate_socket(self, socket_id, user):
        if self.sockets[socket_id].user != user:
            raise RuntimeError(f'socket_id, "{socket_id}", is not owner by user "{user}"')
