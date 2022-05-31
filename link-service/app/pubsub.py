import json
import asyncio
from uuid import uuid4
import datetime
from os import getenv
from bson.objectid import ObjectId
from contextlib import asynccontextmanager

from .rewrite import query_rewrite, doc_to_object

batch_size = int(getenv('BATCH_SIZE'))

class PubSub:

    def __init__(self, db, redis):
        self.db = db
        self.redis = redis

        self.sockets = {} # socket_id -> socket
        self.subscriptions = {} # socket_id -> set of query_ids

        # Listen for updates
        listener = asyncio.create_task(self.listen())

    async def listen(self):
        async with self.redis.pubsub() as p:

            await p.subscribe("results")
            while True:
                msg = await p.get_message(ignore_subscribe_messages=True)
                if msg is not None:
                    msg = json.loads(msg['data'])

                    # Process the messages
                    await self.process_broker(
                            msg['insert_ids'],
                            msg['delete_ids'],
                            msg['query_paths'],
                            msg['now'])

                else:
                    await asyncio.sleep(0.1)

    @asynccontextmanager
    async def register(self, ws):
        # Allocate space for this socket's subscriptions
        socket_id = str(uuid4())
        self.sockets[socket_id] = ws
        self.subscriptions[socket_id] = set()

        try:
            yield socket_id

        finally:
            # Unsubscribe the socket from any hanging queries.
            while self.subscriptions[socket_id]:
                query_id = next(iter(self.subscriptions[socket_id]))
                await self.unsubscribe(socket_id, query_id)
            # And delete all references to it.
            del self.subscriptions[socket_id]
            del self.sockets[socket_id]

    async def subscribe(self, query, since, socket_id, query_id):
        # Process since
        if since:
            since = ObjectId(since)
        else:
            # woo Y2K!
            since = ObjectId.from_datetime(datetime.datetime(2000,1,1))

        # Rewrite the query to account for contexts
        query = query_rewrite(query)

        # Make sure the query has valid syntax
        # by performing a test query
        await self.db.find_one(query)

        # Generate a random subscription ID for this query
        # And add it to the list of subscriptions
        self.subscriptions[socket_id].add(query_id)
        query_path = (socket_id, query_id)

        # Forward this subscription to the query broker
        await self.redis.publish("subscribes", json.dumps({
            'query': query,
            'query_path': query_path
        }))

        # In the background, begin processing existing results
        now = str(ObjectId())
        asyncio.create_task(self.process_existing(query, since, query_path, now))

    async def process_existing(self, query, since, query_path, now):
        # Rewrite
        query = {
            "$and": [query, {
                # So we don't get deleted objects
                "_tombstone": False,
                # And so you can choose to only see
                # things that have changed recently
                "_id": { "$gt": since }
            }]
        }

        await self.stream_query(query, [query_path],
            type='updates',
            historical=True,
            now=now
        )

    async def process_broker(self, insert_ids, delete_ids, query_paths, now):
        # Send the delete results
        # (all at once because it's just a list of IDs)
        if delete_ids:
            if not await self.publish_results(delete_ids, query_paths,
                    type='deletes',
                    historical=False,
                    now=now,
                    complete=(not insert_ids)):
                return

        # Send the insert results in batches
        if insert_ids:
            query = {
                "_id": { "$in": [ObjectId(insert_id) for insert_id in insert_ids] }
            }
            await self.stream_query(query, query_paths,
                type='updates',
                historical=False,
                now=now
            )

    async def stream_query(self, query, query_paths, **kwargs):
        # For each element of the query
        results = []
        cursor = self.db.find(
                query,
                # Return the latest elements first
                sort=[('_id', -1)])

        async for doc in cursor:
            # Add the doc to the batch
            results.append(doc_to_object(doc))
            
            # Once the batch is full
            if len(results) == batch_size:
                # Send the results back
                # And reset the batch
                if not await self.publish_results(results, query_paths, complete=False, **kwargs):
                    break
                results = []

        else:
            # Publish any remainder
            await self.publish_results(results, query_paths, complete=True, **kwargs)

    async def publish_results(self, results, query_paths, **kwargs):

        tasks = []
        counter = { 'count': 0 }

        for socket_id, query_id in query_paths:

            # If we have unsubscribed, no good
            if socket_id not in self.subscriptions:
                continue
            if query_id not in self.subscriptions[socket_id]:
                continue

            # Add the parameters and results
            # to the output and send.
            output = kwargs
            output['queryID'] = query_id
            output['results'] = results

            tasks.append(self.attempt_send(socket_id, output, counter))

        await asyncio.gather(*tasks)

        return counter['count'] > 0

    async def attempt_send(self, socket_id, msg, counter):
        try:
            await self.sockets[socket_id].send_json(msg)
        except:
            pass
        else:
            counter['count'] += 1

    async def unsubscribe(self, socket_id, query_id):
        if query_id not in self.subscriptions[socket_id]:
            raise Exception("query_id does not exist.")

        # Remove the subscription from the socket
        self.subscriptions[socket_id].remove(query_id)

        # And push the result to the query broker
        await self.redis.publish("unsubscribes", json.dumps((socket_id, query_id)))
