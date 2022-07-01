#!/usr/bin/env python3

import asyncio
from utils import *
from os import getenv
import time

batch_size = int(getenv('BATCH_SIZE'))

async def main():

    custom_tag = random_id()
    query_id = random_id()

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        print("adding 10 objects")
        for i in range(10):
            object_base, proof = object_base_and_proof(my_id)
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'idProof': proof,
                'object': object_base | {
                    'content': random_id(),
                    'tags': [custom_tag],
                    'timestamp': time.time()
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'

        print("querying for them")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'tags': custom_tag
            },
            "since": None,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 10

        print("unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'type': 'unsubscribe',
            'queryID': query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print(f"adding {2*batch_size} objects")
        for i in range(2*batch_size):
            object_base, proof = object_base_and_proof(my_id)
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'idProof': proof,
                'object': object_base | {
                    'content': random_id(),
                    'tags': [custom_tag],
                    'timestamp': time.time()
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'

        print("waiting for these to be fully processed")
        print("so they don't accidentally get sent as live updates")
        await asyncio.sleep(1)

        print("querying for them")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'tags': custom_tag
            },
            "since": None,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['historical']
        # Store now
        now = result['now']
        assert not result['complete']
        assert len(result['results']) == batch_size
        timestamp0 = result['results'][0]['timestamp']
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['historical']
        assert not result['complete']
        assert len(result['results']) == batch_size
        timestamp1 = result['results'][0]['timestamp']
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['historical']
        assert result['complete']
        assert len(result['results']) == 10
        timestamp2 = result['results'][0]['timestamp']
        # newest objects are returned first
        assert timestamp0 > timestamp1
        assert timestamp1 > timestamp2

        print("unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'type': 'unsubscribe',
            'queryID': query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("adding just a couple more objects")
        for i in range(20):
            object_base, proof = object_base_and_proof(my_id)
            await send(ws, {
                'messageID': random_id(),
                'idProof': proof,
                'type': 'update',
                'object': object_base | {
                    'content': random_id(),
                    'tags': [custom_tag]
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'

        print("querying only for recently added ones")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'since': now,
            'query': {
                'tags': custom_tag
            },
            'queryID': query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 20

if __name__ == "__main__":
    asyncio.run(main())
