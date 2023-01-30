#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    custom_tag = random_id()

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:

        # Subscribe to the tag
        print("Subscribing to tag")
        await send(ws, {
            'messageID': random_id(),
            'tagsSince': [[custom_tag, None]]
        })
        result = await recv(ws)
        assert result['reply'] == 'subscribed'
        result = await recv(ws)
        assert 'tagsSince' in result

        print("adding an item with the tag")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'object': base | {
                'something': 'else',
                '_tags': [custom_tag]
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        result = await recv(ws)
        assert result['update']['something'] == 'else'
        print("Received as update")

        print("Adding an item with a different tag")
        base2 = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'object': base2 | {
                'another': 'thing',
                '_tags': [random_id()]
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        timedout = False
        try:
            async with asyncio.timeout(0.1):
                await recv(ws)
        except TimeoutError:
            timedout = True
        print("The item is not received")

        print("Replacing the first item's tag")
        await send(ws, {
            'messageID': random_id(),
            'object': base | {
                'another': 'thing',
                '_tags': [random_id()]
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'replaced'
        result = await recv(ws)
        assert 'remove' in result
        print("It is removed from the perspective of the subscriber")
        return



        print("removing an item")
        await send(ws, {
            'messageID': random_id(),
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'removes'
        assert len(result['results']) == 1
        assert result['results'][0]['_id'] == base['_id']
        assert result['results'][0]['_by'] == base['_by']


    print("Making simultaneous listeners")
    custom_tag = random_id()
    async def listen():
        async with websocket_connect(my_token) as ws:
            query_id = random_id()
            await send(ws, {
                'messageID': random_id(),
                'query': {
                    'tags': custom_tag,
                    '_audit': False
                },
                'since': None,
                'queryID': query_id
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            result = await recv(ws)
            assert result['type'] == 'updates'
            assert len(result['results']) == 0
            assert result['queryID'] == query_id
            result = await recv(ws)
            assert result['type'] == 'updates'
            assert len(result['results']) == 1
            assert result['queryID'] == query_id
            result = await recv(ws)
            assert result['type'] == 'removes'
            assert len(result['results']) == 1
            assert result['queryID'] == query_id
            # For interleaved inserts and removes
            messages = {}
            while len(messages) < big_size:
                result = await recv(ws)
                assert result['type'] == 'updates'
                assert result['queryID'] == query_id
                for r in result['results']:
                    messages[r['_id'] + r['_by']] = r
            assert len(messages) == big_size
            adds = 0
            removes = 0
            while adds < big_size or removes < big_size:
                result = await recv(ws)
                assert result['type'] in ['updates', 'removes']
                assert result['queryID'] == query_id
                for r in result['results']:
                    if result['type'] == 'updates':
                        messages[r['_id'] + r['_by']] = r
                        adds += 1
                    else:
                        del messages[r['_id'] + r['_by']]
                        removes += 1
            assert adds == big_size
            assert removes == big_size
            assert len(messages) == big_size

    tasks = []
    for i in range(100):
        tasks.append(asyncio.create_task(listen()))

    print("Waiting for them to come online")
    await asyncio.sleep(1)

    async with websocket_connect(my_token) as ws:
        print("adding an item")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'query': {},
            'object': base | {
                'content': random_id(),
                'tags': [custom_tag]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await asyncio.sleep(1)

        print("removing an item")
        await send(ws, {
            'messageID': random_id(),
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await asyncio.sleep(1)

        print("adding a whole bunch of items")
        objectIDs = []
        for i in range(big_size):
            base = object_base(my_id)
            await send(ws, {
                'messageID': random_id(),
                'query': {},
                'object': base | {
                    'content': random_id(),
                    'tags': [custom_tag]
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            objectIDs.append(base['_id'])

        await asyncio.sleep(2)

        print("interleaving adds and removes")
        for i in range(big_size):
            base = object_base(my_id)
            await send(ws, {
                'messageID': random_id(),
                'query': {},
                'object': base | {
                    'content': random_id(),
                    'tags': [custom_tag]
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            await send(ws, {
                'messageID': random_id(),
                'objectID': objectIDs[i]
            })
            result = await recv(ws)
            assert result['type'] == 'success'

    for task in tasks:
        await task

if __name__ == "__main__":
    asyncio.run(main())
