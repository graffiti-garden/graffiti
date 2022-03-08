class QueryBroker:

    def __init__(self, db):
        self.db = db
        self.queries = {} # socket_id+query_id -> query
        self.socket_to_queries = {} # socket_id -> set of query_ids

    async def change(self, object_id):
        if not self.queries: return

        # See if the object matches any open queries
        matches = self.db.aggregate([
            # Only look at the document that is changing
            { "$match": { "object.id": object_id } },
            # Pass it through all the queries
            { "$facet" : self.queries }
        ])

        changes = {}

        async for match in matches:
            for ids, docs in match.items():
                if docs:
                    # Extract the IDs
                    socket_id, query_id = self.string_to_ids(ids)

                    changes[socket_id] = query_id

        return changes


    def add_socket(self, socket_id):
        self.socket_to_queries[socket_id] = set()

    def remove_socket(self, socket_id):
        for query_id in self.socket_to_queries[socket_id]:
            del self.queries[self.ids_to_string(socket_id, query_id)]
        del self.socket_to_queries[socket_id]

    def add_query(self, socket_id, query_id, query):
        self.queries[self.ids_to_string(socket_id, query_id)] = [{ "$match": query }]
        self.socket_to_queries[socket_id].add(query_id)

    def remove_query(self, socket_id, query_id):
        del self.queries[self.ids_to_string(socket_id, query_id)]
        self.socket_to_queries[socket_id].remove(query_id)

    def ids_to_string(self, socket_id, query_id):
        return socket_id + '&&' + query_id

    def string_to_ids(self, s):
        return s.split('&&', 1)

