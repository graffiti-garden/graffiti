#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        # Try adding an object
        object_base, proof = object_base_and_proof(my_id)
        object_base2, proof2 = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof2,
            'object': object_base | {
                'type': 'justanormalobject',
                'content': {
                    'foo': 'bar'
                },
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not add object without proper proof")

        # Try adding an object
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof,
            'object': object_base | {
                'type': 'justanormalobject',
                'content': {
                    'foo': 'bar'
                },
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Added object")

        # Try replacing the object
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': None,
            'object': object_base | {
                'something': {
                    'totally': 'different'
                }
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Replaced object")

        # Try deleting an object
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try deleting it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-delete object (as expected)")

        # Try replacing again
        await send(ws, {
            'messageID': random_id(),
            'idProof': None,
            'type': 'update',
            'object': object_base | {
                'foo': 'bar'
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-replace object (as expected)")

        # Try creating another object
        object_base, proof = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'idProof': proof,
            'type': 'update',
            'object': object_base | {
                'blahhh': 'blskjf'
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Added another object")

    async with websocket_connect(my_token) as ws:
        print("Replacing it a whole bunch of times in series")
        for i in range(100):
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'idProof': None,
                'object': object_base | {
                    'something': 'random'
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'

        # Try deleting the object
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try deleting it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-delete object (as expected)")

        # Try creating another object
        object_base, proof = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof,
            'object': object_base | {
                'blahhh': 'blskjf',
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Added a new object")

    async def replace_object():
        async with websocket_connect(my_token) as ws:
            await send(ws, {
                'messageID': random_id(),
                'type': 'update',
                'idProof': proof,
                'object': object_base | {
                    'something': 'random'
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            await ws.close()

    # Perform a bunch of replacements with websockets in parallel
    num_replacements = 200
    print(f"Replacing it a {num_replacements} times in parallel...")
    await asyncio.gather(*[replace_object() for i in range(num_replacements)])
    print("Success!")

    async with websocket_connect(my_token) as ws:
        # Try deleting the object
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try deleting it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'delete',
            'objectID': object_base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-delete object (as expected)")

if __name__ == "__main__":
    asyncio.run(main())
