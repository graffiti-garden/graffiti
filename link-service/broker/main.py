import json
import asyncio
import aioredis
from bson.objectid import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

class Broker:
    def __init__(self):
        self.queries = {}       # query_hash -> query
        self.hash_to_paths = {} # query_hash -> set of query_paths
        self.path_to_hash = {}  # query_path -> query_hash

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

        await listener
        await processor

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
                        self.add_query(msg['query'], tuple(msg['query_path']))
                    elif channel == 'unsubscribes':
                        query_path = tuple(json.loads(msg['data']))
                        self.remove_query(query_path)
                # Give the batch a chance to process
                await asyncio.sleep(0)

    async def process_batches(self):
        # Continually process batches
        # and send the results back.
        while True:
            async for query_hash, insert_ids, delete_ids in self.process_batch():
                # Unsubscribe might have happened in the background
                if query_hash not in self.hash_to_paths:
                    continue

                # Publish the changes
                await self.redis.publish("results", json.dumps({
                    'query_paths':  list(self.hash_to_paths[query_hash]),
                    'insert_ids': insert_ids,
                    'delete_ids': delete_ids
                }))

    async def process_batch(self):
        # Wait until we actually have something
        await self.has_batch.wait()
        # When we do, clear it
        self.has_batch.clear()

        # These ids are now "in progress"
        inserting_ids = self.insert_ids
        deleting_ids  = self.delete_ids
        # Initialize new sets for the next batch
        self.insert_ids = set()
        self.delete_ids = set()

        inserting_mongo_ids = [ObjectId(i) for i in inserting_ids]
        deleting_mongo_ids  = [ObjectId(i) for i in deleting_ids]

        # If there are queries
        # (if not the changes can just be discarded,
        #  so they don't get sent twice)
        if self.queries:

            # See if the changing objects match any open queries
            result = self.db.aggregate([
                # Only look at the documents that are changing
                { "$match": { "_id": { "$in": inserting_mongo_ids + deleting_mongo_ids } } },
                # Sort the by _id (equivalent to causal)
                { "$sort": { "_id": 1 } },
                # Pass it through all the queries
                { "$facet" : self.queries }
            ])

            # For each query and each change that matches
            # that query assign it as either an insert or delete
            facets = await result.next()
            for query_hash, groups in facets.items():
                if groups:
                    insert_ids = []
                    delete_ids = []
                    for group in groups:
                        mongo_id = str(group["mongo_id"])
                        if mongo_id in deleting_ids:
                            object_id = group["_id"][0]
                            delete_ids.append(object_id)
                        else:
                            insert_ids.append(mongo_id)

                    yield query_hash, insert_ids, delete_ids

        # Finally, delete all marked items
        await self.db.delete_many({ "_id": { "$in": deleting_mongo_ids } })

    def add_query(self, query, query_path):
        # Take the hash of the query
        query_hash = str(hash(json.dumps(query)))

        if query_hash not in self.queries:
            # Formulate the aggregation pipeline
            query = [
                    # Match the query
                    { "$match": query },
                    # And for each unique object ID,
                    # get the latest document ID
                    # (documents are already sorted in the
                    # global aggregation pipeline)
                    # This will mean that if an object
                    # has been modified multiple times,
                    # only the most recent one is used.
                    { "$group": {
                        "_id" : "$_object._id",
                        "mongo_id" : { "$last": "$_id" }
                    }}
                ]
            # Add it to the list of queries
            self.queries[query_hash] = query
            self.hash_to_paths[query_hash] = set()

        # Add the id to the mappings
        self.hash_to_paths[query_hash].add(query_path)
        self.path_to_hash[query_path] = query_hash

    def remove_query(self, query_path):
        # Get the hash corresponding to the query
        if query_path in self.path_to_hash:
            query_hash = self.path_to_hash[query_path]
            del self.path_to_hash[query_path]
            self.hash_to_paths[query_hash].remove(query_path)

            # If no one is subscribing,
            # remove the query
            if not self.hash_to_paths[query_hash]:
                del self.hash_to_paths[query_hash]
                del self.queries[query_hash]

    def insert_id(self, _id):
        self.insert_ids.add(_id)
        self.has_batch.set()

    def delete_id(self, _id):
        self.delete_ids.add(_id)
        self.has_batch.set()

if __name__ == "__main__":
    asyncio.run(Broker().run())
