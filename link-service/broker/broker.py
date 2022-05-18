class QueryBroker:

    def __init__(self, db):
        self.db = db

        self.has_batch = asyncio.Event()

        self.queries = {}
        self.add_ids = set()
        self.delete_ids = set()

    async def process_batch(self):
        # Wait until we actually have something
        await self.has_batch.wait()
        # Now we don't
        self.has_batch.clear()

        # These ids are now "in progress"
        adding_ids = self.add_ids
        deleting_ids = self.delete_ids
        # Initialize new sets for the next batch
        self.add_ids = set()
        self.delete_ids = set()

        # Mostly, we don't care if we're adding or deleting
        changing_ids = list(adding_ids.union(deleting_ids))

        # See if the changing objects match any open queries
        result = self.db.aggregate([
            # Only look at the documents that are changing
            { "$match": { "_id": changing_ids } },
            # Sort the by _id (equivalent to causal)
            { "$sort": { "_id": 1 } },
            # Pass it through all the queries
            { "$facet" : self.queries }
        ])

        # For each query and each change that matches
        # that query either return "delete" or "update", depending
        facets = await result.next()
        for query_hash, groups in facets.items():
            if groups:
                output = {
                    'type': 'subscribe',

                }
                for 
                yield query_hash, [
                        ("delete", group["_id"]) if group["mongo_id"] in deleting_ids
                        else ("update", group["mongo_id"])
                        for group in groups]

        # Finally, delete all marked items
        await self.db.deleteMany({ "_id": self.deleting_ids})

    def group_to_output(group, deleting_ids):
        if group["mongo_id"] in deleting_ids:
            return {
                    "delete",

    async def add_query(self, query_hash, query):
        # Formulate the aggregation pipeline
        query = [
                # Match the query
                { "$match": query },
                # And for each unique object ID,
                # get the latest document ID
                # (documents are already sorted in the
                # global aggregation pipeline)
                { "$group": {
                    "_id" : "$object._id",
                    "mongo_id" : { "$last": "$_id" }
                }}
            ]
        self.queries[query_hash] = query

        # Mark the batch and return
        if self.add_ids or self.deleting_ids:
            self.has_batch.set()

        return query_hash

    def delete_query(self, query_hash):
        if query_hash in self.queries:
            del self.queries[query_hash]
        if not self.queries:
            self.has_batch.clear()

    def add_id(self, _id):
        self.add_ids.add(_id)
        if self.queries:
            self.has_batch.set()

    def delete_id(self, _id):
        self.delete_ids.add(_id)
        if self.queries:
            self.has_batch.set()

    def deleted_ids(self):
        return list(self.delete_ids.union(self.deleting_ids))
