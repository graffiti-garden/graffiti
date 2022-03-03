from .rewrite import query_rewrite

"""
Listens to changes in the database and
pushes those to appropriate sockets.
"""

class QueryBroker:

    def __init__(self, db):
        self.db = db
        self.sockets = {} # socket_id -> socket
        self.queries = {} # socket_id+query_id -> query
        self.socket_to_queries = {} # socket_id -> set of query_ids

    async def change(self, object_id, delete=False):
        if not self.queries: return

        # See if the object matches any open queries
        matches = self.db.aggregate([
            # Only look at the document that is changing
            { "$match": { "object.id": object_id } },
            # Pass it through all the queries
            { "$facet" : self.queries }
        ])

        async for match in matches:
            for ids, docs in match.items():
                if docs is not None:
                    # Extract the IDs
                    socket_id, query_id = self.string_to_ids(ids)

                    # If the socket has been removed during this
                    # loop, don't try to do anything
                    if socket_id not in self.sockets:
                        continue

                    # There can only ever be one document
                    doc = docs[0]

                    # Otherwise, try to send the updates back to the sockets
                    if delete:
                        await self.sockets[socket_id].delete(query_id, object_id)
                    else:
                        await self.sockets[socket_id].update(query_id, doc)


    def add_socket(self, socket):
        self.sockets[socket.id] = socket
        self.socket_to_queries[socket.id] = set()

    def remove_socket(self, socket):
        for query_id in self.socket_to_queries[socket.id]:
            del self.queries[self.ids_to_string(socket.id, query_id)]
        del self.socket_to_queries[socket.id]
        del self.sockets[socket.id]

    async def add_query(self, socket_id, query_id, query, signature):
        # Rewrite the query and check if its valid
        query = query_rewrite(query, signature)
        # Check if it is valid (if it isn't this will error)
        await self.db.find_one(query)

         # Make sure the socket is valid too
        self.validate_socket(socket_id, signature)

        # Add the query
        self.queries[self.ids_to_string(socket_id, query_id)] = [{ "$match": query }]
        self.socket_to_queries[socket_id].add(query_id)

    def remove_query(self, socket_id, query_id, signature):
        self.validate_socket(socket_id, signature)

        # Remove it
        del self.queries[self.ids_to_string(socket_id, query_id)]
        self.socket_to_queries[socket_id].remove(query_id)

    def ids_to_string(self, socket_id, query_id):
        return socket_id + '&&' + query_id

    def string_to_ids(self, s):
        return s.split('&&', 1)

    def validate_socket(self, socket_id, signature):
        if self.sockets[socket_id].signature != signature:
            raise RuntimeError(f'socket_id, "{socket_id}", is not owned by "{signature}"')
