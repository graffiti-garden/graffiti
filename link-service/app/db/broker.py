class QueryBroker:

    def __init__(self, db):
        self.db = db

        self.queries = {}
        self.add_ids = set()
        self.delete_ids = set()
        self.adding_ids = set()
        self.deleting_ids = set()

    async def process_batch(self):
        if not self.queries or not (self.add_ids or self.delete_ids):
            # Nothing to do
            return

        # Mark the current batch as "in progress"
        self.adding_ids = self.add_ids
        self.deleting_ids = self.delete_ids
        # Initialize placeholders for the next batch
        self.add_ids = set()
        self.delete_ids = set()

        # Mostly we don't care if we're adding or deleting
        changing_ids = self.adding_ids.union(self.deleting_ids)

        # See if the changing objects match any open queries
        matches = self.db.aggregate([
            # Only look at the documents that are changing
            { "$match": { "_id": list(changing_ids) } },
            # Sort the by _id (equivalent to causal)
            { "$sort": { "_id": 1 } },
            # Pass it through all the queries
            { "$facet" : self.queries }
        ])

        async for match in matches:
            for query_hash, groups in match.items():
                if groups:
                    yield query_hash, [
                            ("delete", group["id"]) if group["doc"]["_id"] in self.deleting_ids
                            else ("update", group["doc"])
                            for group in groups]

        # Delete all marked items
        await self.db.deleteMany({ "_id": self.deleting_ids})

    def add_id(_id):
        self.add_ids.add(_id)

    def delete_id(_id):
        self.delete_ids.add(_id)

    async def add_query(self, query):
        # Perform query rewriting
        query, query_hash = query_rewrite(query)

        # Make sure the query is valid by doing a find-one
        await self.db.find_one(query)

        # Formulate the aggregation pipeline
        query = [
                # Match the query
                { "$match": query },
                # And for each unique object ID,
                # get the latest document (documents
                # are already sorted in the global
                # aggregation pipeline)
                { "$group": {
                    "_id" : "$object._id",
                    "doc" : { "$last": "$$ROOT" }
                }}
            ]
        self.queries[query_hash] = query

        return query_hash

    def delete_query(self, query_hash):
        if query_hash in self.queries:
            del self.queries[query_hash]
