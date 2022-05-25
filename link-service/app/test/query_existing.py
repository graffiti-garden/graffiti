#!/usr/bin/env python3

import asyncio
from utils import *
from os import getenv

batch_size = int(getenv('BATCH_SIZE'))

async def main():

    custom_tag = random_id()

    my_id, my_token = id_and_token()
    async with websocket_connect(my_token) as ws:
        print("adding 10 objects")
        for i in range(10):
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'object': {
                    'content': random_id(),
                    'tags': [custom_tag]
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
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        query_id = result['queryID']
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
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'object': {
                    'content': random_id(),
                    'tags': [custom_tag]
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
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        query_id = result['queryID']
        # Store now
        now = result['now']
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert not result['complete']
        assert len(result['results']) == batch_size
        timestamp0 = result['results'][0]['_timestamp']
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert not result['complete']
        assert len(result['results']) == batch_size
        timestamp1 = result['results'][0]['_timestamp']
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 10
        timestamp2 = result['results'][0]['_timestamp']
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
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'object': {
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
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 20

if __name__ == "__main__":
    asyncio.run(main())
