#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_actor_id, my_token = actor_id_and_token()
    async with websocket_connect(my_token) as ws:
        # Try adding an object
        base  = object_base(my_actor_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'type': 'justanormalobject',
                'content': {
                    'foo': 'bar'
                },
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        print("Added object")

        # Try replacing the object
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'something': {
                    'totally': 'different'
                }
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'replaced'
        print("Replaced object")

        # Try removing an object
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv(ws)
        assert result['reply'] == 'removed'
        print("Removed object")

        # Try removing it *again*
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv(ws)
        assert 'error' in result
        print("Could not re-remove object (as expected)")

        # Try replacing again
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'foo': 'bar'
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        print("Could replace object")

        # Try removing an object
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv(ws)
        assert result['reply'] == 'removed'
        print("Removed the replacement")

        # Try creating another object
        base = object_base(my_actor_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'blahhh': 'blskjf'
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        print("Added another object")

    async with websocket_connect(my_token) as ws:
        print("Replacing it 200 times in series")
        for i in range(200):
            await send(ws, {
                'messageID': random_id(),
                'update': base | {
                    'something': 'random'
                }
            })
            result = await recv(ws)
            assert result['reply'] == 'replaced'
        print("...Done")

        # Try removing the object
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv(ws)
        assert result['reply'] == 'removed'
        print("Deleted object")

        # Try removing it *again*
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv(ws)
        assert 'error' in result
        print("Could not re-remove object (as expected)")

        # Try creating another object
        base = object_base(my_actor_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'blahhh': 'blskjf',
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        print("Added a new object")

    async def replace_object():
        async with websocket_connect(my_token) as ws:
            await send(ws, {
                'messageID': random_id(),
                'update': base | {
                    'something': 'random'
                }
            })
            result = await recv(ws)
            assert result['reply'] == 'replaced'
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
            'remove': base['id']
        })
        result = await recv(ws)
        assert result['reply'] == 'removed'
        print("Removed object")

        # Try removing it *again*
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv(ws)
        assert 'error' in result
        print("Could not re-remove object (as expected)")

        base  = object_base(my_actor_id)
        context = random_id()
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'context': [context]
            }
        })
        result = await recv(ws)
        print(result)
        assert result['reply'] == 'inserted'
        print("Added another object")

    # Create a new user
    my_actor_id, my_token = actor_id_and_token()
    async with websocket_connect(my_token) as ws:
        print("Created new user")

        # List the contexts associated with the user
        await send(ws, { 'messageID': random_id(), "ls": None })
        result = await recv(ws)
        assert len(result["reply"]) == 0
        print("User has no contexts")

        # Add 10 objects with the same context
        print("Adding 10 objects with the same context")
        for i in range(10):
            base  = object_base(my_actor_id)
            await send(ws, {
                'messageID': random_id(),
                'update': base | {
                    'context': ['hello']
                }
            })
            result = await recv(ws)
            assert result['reply'] == 'inserted'
        print("...Done")

        # List the contexts associated with the user
        await send(ws, { 'messageID': random_id(), "ls": None })
        result = await recv(ws)
        assert len(result["reply"]) == 1
        assert 'hello' in result["reply"]
        print("User has one context")

        print("Adding an object the same, plus another context")
        base  = object_base(my_actor_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'context': ['hello', 'goodbye']
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'

        # List the contexts associated with the user
        await send(ws, { 'messageID': random_id(), "ls": None })
        result = await recv(ws)
        assert len(result["reply"]) == 2
        assert 'hello' in result["reply"]
        assert 'goodbye' in result["reply"]
        print("The user has the two contexts")
        
        print("Removing the additional object")
        await send(ws, {
            'messageID': random_id(),
            'remove': base["id"]
        })
        result = await recv(ws)
        assert result['reply'] == 'removed'

        # Still one context
        await send(ws, { 'messageID': random_id(), "ls": None })
        result = await recv(ws)
        assert len(result["reply"]) == 1
        assert 'hello' in result["reply"]
        print("The user has only one context")


        # Getting objects
        base  = object_base(my_actor_id)
        await send(ws, {
            'messageID': random_id(),
            'get': base['id']
        })
        result = await recv(ws)
        assert 'error' in result
        print("Can't get an object that does not exist")

        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'content': 12345
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        print("Inserted the object")

        await send(ws, {
            'messageID': random_id(),
            'get': base['id']
        })
        result = await recv(ws)
        assert result["reply"]["content"] == 12345
        print("Getting content is correct")

        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'content': 67890
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'replaced'
        print("Inserted the object")

        await send(ws, {
            'messageID': random_id(),
            'get': base['id']
        })
        result = await recv(ws)
        assert result["reply"]["content"] == 67890
        print("Getting replaced content is correct")

        base_private  = object_base(my_actor_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base_private | {
                'something': 'asdf',
                'bto': []
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        print("Inserted a private object")

        await send(ws, {
            'messageID': random_id(),
            'get': base_private['id']
        })
        result = await recv(ws)
        assert result["reply"]["something"] == 'asdf'
        print("Getting private content is correct")

    other_id, other_token = actor_id_and_token()
    async with websocket_connect(other_token) as ws:
        print("Logged in as other user")

        await send(ws, {
            'messageID': random_id(),
            'get': base['id']
        })
        result = await recv(ws)
        assert result["reply"]["content"] == 67890
        print("Other user can see public content")

        await send(ws, {
            'messageID': random_id(),
            'get': base_private['id']
        })
        result = await recv(ws)
        assert 'error' in result
        print("Other user cannot see private content")

        base_other  = object_base(other_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base_other | {
                'secret': 'message',
                'bcc': [base['actor']]
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        print("Other user inserted a private message to first user")

        await send(ws, {
            'messageID': random_id(),
            'get': base_other['id']
        })
        result = await recv(ws)
        assert result["reply"]["secret"] == "message"
        print("Other user can see sent private message")

    async with websocket_connect(my_token) as ws:
        print("Logged back in as original user")

        await send(ws, {
            'messageID': random_id(),
            'get': base_other['id']
        })
        result = await recv(ws)
        assert result["reply"]["secret"] == "message"
        print("Original user can see sent private message")

    another_other_id, another_other_token = actor_id_and_token()
    async with websocket_connect(another_other_token) as ws:
        print("Logged in as another other user")

        await send(ws, {
            'messageID': random_id(),
            'get': base_other['id']
        })
        result = await recv(ws)
        assert 'error' in result
        print("Another other user can't see the private message")

if __name__ == "__main__":
    asyncio.run(main())
