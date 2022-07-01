#!/usr/bin/env python3

import asyncio
from utils import *
from os import getenv

batch_size = int(getenv('BATCH_SIZE'))
big_size = 3*batch_size

async def main():

    custom_tag = random_id()

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        print("starting to listen")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'tags': custom_tag
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 0

        print("adding an item")
        object_base, proof = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof,
            'object': object_base | {
                'content': random_id(),
                'tags': [custom_tag]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1

        print("deleting an item")
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'deletes'
        assert len(result['results']) == 1
        assert result['results'][0] == object_base['_id']


    print("Making simultaneous listeners")
    custom_tag = random_id()
    async def listen():
        async with websocket_connect(my_token) as ws:
            query_id = random_id()
            await send(ws, {
                'messageID': random_id(),
                'type': 'subscribe',
                'query': {
                    'tags': custom_tag
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
            assert result['type'] == 'deletes'
            assert len(result['results']) == 1
            assert result['queryID'] == query_id
            # For interleaved inserts and deletes
            messages = {}
            while len(messages) < big_size:
                result = await recv(ws)
                assert result['type'] == 'updates'
                assert result['queryID'] == query_id
                for r in result['results']:
                    messages[r['_id']] = r
            assert len(messages) == big_size
            adds = 0
            deletes = 0
            while adds < big_size or deletes < big_size:
                result = await recv(ws)
                assert result['type'] in ['updates', 'deletes']
                assert result['queryID'] == query_id
                for r in result['results']:
                    if result['type'] == 'updates':
                        messages[r['_id']] = r
                        adds += 1
                    else:
                        del messages[r]
                        deletes += 1
            assert adds == big_size
            assert deletes == big_size
            assert len(messages) == big_size

    tasks = []
    for i in range(100):
        tasks.append(asyncio.create_task(listen()))

    print("Waiting for them to come online")
    await asyncio.sleep(1)

    async with websocket_connect(my_token) as ws:
        print("adding an item")
        object_base, proof = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof,
            'object': object_base | {
                'content': random_id(),
                'tags': [custom_tag]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await asyncio.sleep(1)

        print("deleting an item")
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await asyncio.sleep(1)

        print("adding a whole bunch of items")
        objectIDs = []
        for i in range(big_size):
            object_base, proof = object_base_and_proof(my_id)
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'idProof': proof,
                'object': object_base | {
                    'content': random_id(),
                    'tags': [custom_tag]
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            objectIDs.append(object_base['_id'])

        await asyncio.sleep(2)

        print("interleaving adds and deletes")
        for i in range(big_size):
            object_base, proof = object_base_and_proof(my_id)
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'idProof': proof,
                'object': object_base | {
                    'content': random_id(),
                    'tags': [custom_tag]
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            await send(ws, {
                'messageID': random_id(),
                'type': 'delete',
                'objectID': objectIDs[i]
            })
            result = await recv(ws)
            assert result['type'] == 'success'

    for task in tasks:
        await task

if __name__ == "__main__":
    asyncio.run(main())
