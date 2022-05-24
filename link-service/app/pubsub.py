import json
import asyncio
from uuid import uuid4
import datetime
from bson.objectid import ObjectId
from contextlib import asynccontextmanager

from .rewrite import query_rewrite, doc_to_object

class PubSub:

    def __init__(self, db, redis):
        self.db = db
        self.redis = redis

        self.sockets = {} # socket_id -> socket
        self.subscriptions = {} # socket_id -> set of query_ids

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

    async def subscribe(self, query, since, socket_id):
        # Rewrite the query to account for contexts
        query = query_rewrite(query)

        # Make sure the query has valid syntax
        # by performing a test query
        await self.db.find_one(query)

        # Generate a random subscription ID for this query
        # And add it to the list of subscriptions
        query_id = str(uuid4())
        self.subscriptions[socket_id].add(query_id)

        # In the background, begin processing existing results
        if not since:
            since = ObjectId.from_datetime(datetime.datetime(2000,1,1))
        else:
            since = ObjectId(since)
        asyncio.create_task(self.query_existing(query, since, socket_id, query_id))

        # Forward this subscription to the query broker
        await self.redis.publish("subscribes", json.dumps({
            'query': query,
            'socket_id': socket_id,
            'query_id': query_id
        }))

        return query_id, str(ObjectId())

    async def query_existing(self, query, since, socket_id, query_id):
        # Start the query
        results = []
        cursor = self.db.find({
            "$and": [query, {
                "_tombstone": False,
                # So you can choose to only see
                # things that have changed recently
                "_id": { "$gt": since }
            }]
            # Return the latest elements first
        }, sort=[('_id', -1)])
        async for doc in cursor:
            # Add the doc to the batch
            results.append(doc_to_object(doc))
            
            # Once the batch is full
            if len(results) > 100:
                # Send the results back
                # And reset the batch
                if not await self.publish_results(results, socket_id, query_id):
                    break
                results = {}

        else:
            # Publish any remainder
            await self.publish_results(results, socket_id, query_id, complete=True)

    async def publish_results(self, results, socket_id, query_id, complete=False):
        # If we have unsubscribed, break
        if socket_id not in self.subscriptions:
            return False
        if query_id not in self.subscriptions[socket_id]:
            return False

        await self.sockets[socket_id].send_json({
            'type': 'results',
            'historical': True,
            'complete': complete,
            'queryID': query_id,
            'results': results
        })
        return True


    async def unsubscribe(self, socket_id, query_id):
        if query_id not in self.subscriptions[socket_id]:
            raise Exception("query_id does not exist.")

        # Remove the subscription from the socket
        self.subscriptions[socket_id].remove(query_id)

        # And push the result to the query broker
        await self.redis.publish("unsubscribes", json.dumps({
            'query_id': query_id,
        }))
