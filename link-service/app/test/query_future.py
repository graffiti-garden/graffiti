#!/usr/bin/env python3

import asyncio
from utils import *
from os import getenv

batch_size = int(getenv('BATCH_SIZE'))

async def main():

    custom_tag = random_id()

    my_id, my_token = id_and_token()
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
        objectID = result['objectID']
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1

        print("deleting an item")
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': objectID
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'deletes'
        assert len(result['results']) == 1
        assert result['results'][0] == objectID


    print("Making simultaneous listeners")
    custom_tag = random_id()
    async def listen():
        async with websocket_connect(my_token) as ws:
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
            result = await recv(ws)
            assert result['type'] == 'updates'
            assert len(result['results']) == 1
            result = await recv(ws)
            assert result['type'] == 'deletes'
            assert len(result['results']) == 1
    tasks = []
    for i in range(100):
        tasks.append(asyncio.create_task(listen()))

    print("Waiting for them to come online")
    await asyncio.sleep(1)

    async with websocket_connect(my_token) as ws:
        print("adding an item")
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
        objectID = result['objectID']

        await asyncio.sleep(1)

        print("deleting an item")
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': objectID
        })
        result = await recv(ws)
        assert result['type'] == 'success'

    for task in tasks:
        await task

if __name__ == "__main__":
    asyncio.run(main())
