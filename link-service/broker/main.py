import json
import asyncio
import aioredis
from hashlib import sha256
from bson.objectid import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

class Broker:
    def __init__(self):
        self.queries = {}     # query_hash -> query
        self.hash_to_ids = {} # query_hash -> set of query_ids
        self.id_to_hash = {}  # query_id   -> query_hash

        self.insert_ids = set()
        self.delete_ids = set()

    async def run(self):
        # Connect to Mongo
        client = AsyncIOMotorClient('mongo')
        self.db = client.graffiti.objects

        # Connect to redis
        self.redis = aioredis.from_url("redis://redis", decode_responses=True)

        # Initialize the batch event
        self.has_batch = asyncio.Event()

        # Listen for updates
        listener = asyncio.create_task(self.listen())
        processor = asyncio.create_task(self.process_batches())

        await processor
        await listener

    async def listen(self):
        async with self.redis.pubsub() as p:

            await p.subscribe(
                    "inserts",
                    "deletes",
                    "subscribes",
                    "unsubscribes")

            while True:
                msg = await p.get_message(ignore_subscribe_messages=True)
                if msg is not None:
                    channel = msg['channel']
                    if channel == 'inserts':
                        self.insert_id(msg['data'])
                    elif channel == 'deletes':
                        self.delete_id(msg['data'])
                    elif channel == 'subscribes':
                        msg = json.loads(msg['data'])
                        self.add_query(msg['query'], msg['query_id'])
                    elif channel == 'unsubscribes':
                        self.remove_query(msg['data'])
                await asyncio.sleep(0)

    async def process_batches(self):
        # Continually process batches
        # and send the results back.
        while True:
            async for change in self.process_batch():
                # Publish the changes
                print(change, flush=True)
            # yield query_hash, [
                    # ("delete", group["_id"]) if group["mongo_id"] in deleting_ids
                    # else ("update", group["mongo_id"])
                    # for group in groups]

    async def process_batch(self):
        # Wait until we actually have something
        await self.has_batch.wait()
        # When we do, clear it
        self.has_batch.clear()

        # These ids are now "in progress"
        inserting_ids = [ObjectId(i) for i in self.insert_ids]
        deleting_ids  = [ObjectId(i) for i in self.delete_ids]
        # Initialize new sets for the next batch
        self.insert_ids = set()
        self.delete_ids = set()

        # See if the changing objects match any open queries
        result = self.db.aggregate([
            # Only look at the documents that are changing
            { "$match": { "_id": inserting_ids + deleting_ids } },
            # Sort the by _id (equivalent to causal)
            { "$sort": { "_id": 1 } },
            # Pass it through all the queries
            { "$facet" : self.queries }
        ])

        # For each query and each change that matches
        # that query either return "delete" or "update", depending
        facets = await result.next()
        for query_hash, groups in facets.items():
            yield query_hash, groups

        # Finally, delete all marked items
        await self.db.delete_many({ "_id": deleting_ids })

    def add_query(self, query, query_id):
        # Take the hash of the query
        query_hash = sha256(json.dumps(query).encode()).hexdigest()

        if query_hash not in self.queries:
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
            # Add it to the list of queries
            self.queries[query_hash] = query
            self.hash_to_ids[query_hash] = set()

            # If there are some IDs, process them
            if self.insert_ids or self.delete_ids:
                self.has_batch.set()

        # Add the id to the mappings
        self.hash_to_ids[query_hash].add(query_id)
        self.id_to_hash[query_id] = query_hash

    def remove_query(self, query_id):
        # Get the hash corresponding to the query
        if query_id in self.id_to_hash:
            query_hash = self.id_to_hash[query_id]
            del self.id_to_hash[query_id]
            self.hash_to_ids[query_hash].remove(query_id)

            # If no one is subscribing,
            # remove the query
            if not self.hash_to_ids[query_hash]:
                del self.hash_to_ids[query_hash]
                del self.queries[query_hash]

                # If there are no more queries at all,
                # stop processing
                if not self.queries:
                    self.has_batch.clear()

    def insert_id(self, _id):
        self.insert_ids.add(_id)
        if self.queries:
            self.has_batch.set()

    def delete_id(self, _id):
        self.delete_ids.add(_id)
        if self.queries:
            self.has_batch.set()

if __name__ == "__main__":
    asyncio.run(Broker().run())
