#!/usr/bin/env python3

import asyncio
from utils import *

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
        result = await recv(ws)
        assert result['type'] == 'results'
        assert result['complete']
        assert len(result['results']) == 10

        print("adding 200 objects")
        for i in range(200):
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
        # Store now
        now = result['now']
        result = await recv(ws)
        assert result['type'] == 'results'
        assert not result['complete']
        assert len(result['results']) == 100
        result = await recv(ws)
        assert result['type'] == 'results'
        assert not result['complete']
        assert len(result['results']) == 100
        result = await recv(ws)
        assert result['type'] == 'results'
        assert result['complete']
        assert len(result['results']) == 10

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
        assert result['type'] == 'results'
        assert result['complete']
        assert len(result['results']) == 20

if __name__ == "__main__":
    asyncio.run(main())
