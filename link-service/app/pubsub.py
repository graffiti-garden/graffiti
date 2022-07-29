import json
import asyncio
from uuid import uuid4
import datetime
from os import getenv
from bson.objectid import ObjectId
from contextlib import asynccontextmanager

from .rewrite import query_rewrite, audit_rewrite, doc_to_object

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

                    # Process the messages in parallel
                    await asyncio.gather(*[
                        self.process_broker(
                            insert_ids,
                            delete_ids,
                            query_paths,
                            msg["now"])
                        for query_paths, insert_ids, delete_ids in msg["results"]])

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

    async def subscribe(self, query, since, audit, socket_id, query_id, owner_id):
        # Process since
        if since:
            since = ObjectId(since)
        else:
            # woo Y2K!
            since = ObjectId.from_datetime(datetime.datetime(2000,1,1))

        # Rewrite the query to account for contexts
        # Except with audits
        if audit:
            query = audit_rewrite(query, owner_id)
        else:
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
            query_paths = await self.publish_results(delete_ids, query_paths,
                    type='deletes',
                    historical=False,
                    now=now,
                    complete=(not insert_ids))
            if not query_paths:
                return

        # Send the insert results in batches
        if insert_ids:
            query = {
                "_id": { "$in": [ObjectId(i) for i in insert_ids] }
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
                query_paths = await self.publish_results(results, query_paths, complete=False, **kwargs)
                if not query_paths:
                    break
                results = []

        else:
            # Publish any remainder
            query_paths = await self.publish_results(results, query_paths, complete=True, **kwargs)

        return query_paths

    async def publish_results(self, results, query_paths, **kwargs):

        # Add the results to the message
        msg = kwargs
        msg['results'] = results

        # Keep track of the query paths that are still active
        live_paths = []

        # Send the message to each socket 
        tasks = []
        for query_path in query_paths:
            tasks.append(self.attempt_send(msg, query_path, live_paths))
        await asyncio.gather(*tasks)

        return live_paths

    async def attempt_send(self, msg, query_path, live_paths):
        socket_id, query_id = query_path

        # If we have unsubscribed, no good
        if socket_id not in self.subscriptions:
            return
        if query_id not in self.subscriptions[socket_id]:
            return

        try:
            await self.sockets[socket_id].send_json(msg|{'queryID': query_id})
        except:
            pass
        else:
            # Attempt succeeded so maintain the query path
            live_paths.append(query_path)

    async def unsubscribe(self, socket_id, query_id):
        if query_id not in self.subscriptions[socket_id]:
            raise Exception("query_id does not exist.")

        # Remove the subscription from the socket
        self.subscriptions[socket_id].remove(query_id)

        # And push the result to the query broker
        await self.redis.publish("unsubscribes", json.dumps((socket_id, query_id)))
