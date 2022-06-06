#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = id_and_token()
    async with websocket_connect(my_token) as ws:
        # Try adding an object
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': {
                'type': 'justanormalobject',
                'content': {
                    'foo': 'bar'
                },
                '_by': my_id,
                '_to': [random_id(), random_id()]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        object_id = result['objectID']
        print("Added object")

        # Try replacing the object
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': {
                '_id': object_id,
                'something': {
                    'totally': 'different'
                }
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        object_id = result['objectID']
        print("Replaced object")

        # Try deleting an object
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try deleting it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_id
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-delete object (as expected)")

        # Try replacing again
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': {
                '_id': object_id,
                'foo': 'bar'
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-replace object (as expected)")

        # Try creating another object
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': {
                'blahhh': 'blskjf'
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        object_id = result['objectID']
        print("Added another object")

    async def replace_object():
        async with websocket_connect(my_token) as ws:
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'object': {
                    '_id': object_id,
                    'something': 'random'
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            await ws.close()

    # Perform a bunch of replacements with websockets in parallel
    num_replacements = 100
    print(f"Replacing it a {num_replacements} times in parallel...")
    await asyncio.gather(*[replace_object() for i in range(num_replacements)])
    print("Success!")

    async with websocket_connect(my_token) as ws:
        # Try deleting the object
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try deleting it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_id
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-delete object (as expected)")

if __name__ == "__main__":
    asyncio.run(main())
