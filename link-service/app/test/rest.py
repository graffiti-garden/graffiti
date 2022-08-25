#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        # Try adding an object
        base  = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {},
            'object': base | {
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
            'query': {},
            'object': base | {
                'something': {
                    'totally': 'different'
                }
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Replaced object")

        # Try removing an object
        await send(ws, {
            'messageID': random_id(),
            'type': 'remove',
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try removing it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'remove',
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-remove object (as expected)")

        # Try replacing again
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {},
            'object': base | {
                'foo': 'bar'
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Could replace object")

        # Try removing an object
        await send(ws, {
            'messageID': random_id(),
            'type': 'remove',
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try creating another object
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {},
            'object': base | {
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
                'query': {},
                'object': base | {
                    'something': 'random'
                }
            })
            result = await recv(ws)
            assert result['type'] == 'success'

        # Try removing the object
        await send(ws, {
            'messageID': random_id(),
            'type': 'remove',
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try removing it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'remove',
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-remove object (as expected)")

        # Try creating another object
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {},
            'object': base | {
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
                'query': {},
                'object': base | {
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
        # Try removing the object
        await send(ws, {
            'messageID': random_id(),
            'type': 'remove',
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Deleted object")

        # Try removing it *again*
        await send(ws, {
            'messageID': random_id(),
            'type': 'remove',
            'objectID': base['_id']
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not re-remove object (as expected)")

        base  = object_base(my_id)
        tag = random_id()
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {},
            'object': base | {
                'tag': tag
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Added another object")

        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {},
            'object': base | {
                '_inContextIf': [{
                    '_queryFailsWithout': ['thiskeydoesnotexist']
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not be replaced with an invalid context")

        query_id = random_id()
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'tag': tag,
                '_audit': False
            },
            "since": None,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 1
        print("The original still exists")
        await send(ws, {
            'messageID': random_id(),
            'type': 'unsubscribe',
            'queryID': query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        
        base  = object_base(my_id)
        tag = random_id()
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {
                'foo': tag,
                'bar': True
            },
            'object': base | {
                'foo': tag,
                'bar': False
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not add object that does not match the query")

        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {
                'foo': tag,
                'bar': True
            },
            'object': base | {
                'foo': tag,
                'bar': True,
                '_inContextIf': [{
                    '_queryFailsWithout': ['foo']
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("Could add it when it matches the query")

        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {
                'foo': tag,
                'bar': True
            },
            'object': base | {
                'foo': tag,
                'bar': 1234
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not replace it with an object that does not match")

        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {
                'foo': { '$type': 'notreal' },
                'bar': True
            },
            'object': base | {
                'foo': tag,
                'bar': True
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not replace it when the query is invalid")

        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'query': {
                'bar': True
            },
            'object': base | {
                'foo': tag,
                'bar': True,
                '_inContextIf': [{
                    '_queryFailsWithout': ['foo']
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        print("Could not replace it when it's out of context")

        query_id = random_id()
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'foo': tag
            },
            "since": None,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 1
        print("The original still exists")
        await send(ws, {
            'messageID': random_id(),
            'type': 'unsubscribe',
            'queryID': query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'

if __name__ == "__main__":
    asyncio.run(main())
