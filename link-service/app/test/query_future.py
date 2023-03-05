#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    custom_context = random_id()
    custom_context2 = random_id()
    custom_context3 = random_id()
    private_context1 = random_id()
    private_context2 = random_id()

    async def recv_future(ws):
        result = {'reply'}
        while 'reply' in result or ('historical' in result and result['historical']):
            result = await recv(ws)
        return result

    my_id, my_token = actor_id_and_token()
    async with websocket_connect(my_token) as ws:

        print("Defining an object")
        base = object_base(my_id)
        print("Subscribing to it's ID")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [base["id"]]
        })
        result = await recv(ws)
        assert result['reply'] == 'subscribed'

        print("Now updating the object")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'hello': 'world',
                'context': [custom_context]
            }
        })
        result = await recv_future(ws)
        assert result['update']['hello'] == 'world'
        print("...received")

        print("Replacing it")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'hello': 'goodbye',
                'context': [custom_context2]
            }
        })
        result = await recv_future(ws)
        assert result['update']['hello'] == 'goodbye'
        print("...received")

        print("Removing it")
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv_future(ws)
        assert 'remove' in result
        print("...removed")

        print("Unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'unsubscribe': [base["id"]]
        })
        result = await recv(ws)
        print(result)
        assert result['reply'] == 'unsubscribed'

        # Subscribe to the context
        print("Subscribing to context")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context]
        })
        result = await recv(ws)
        assert result['reply'] == 'subscribed'

        print(f"adding an item with the context {custom_context}")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'something': 'else',
                'context': [custom_context]
            }
        })
        result = await recv_future(ws)
        assert result['update']['something'] == 'else'
        print("Received as update")

        print("Adding another item")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'how': 'r u?',
                'context': [custom_context]
            }
        })
        result = await recv_future(ws)
        assert result['update']['how'] == 'r u?'
        print("Received as update")

        print("Adding an item with a different context")
        base2 = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base2 | {
                'another': 'thing',
                'context': [random_id()]
            }
        })
        timedout = False
        assert not await another_message(ws, recv=recv_future)
        print("The item is not received")

        print("Replacing the first item's context")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'another': 'thing',
                'context': [random_id()]
            }
        })
        result = await recv_future(ws)
        assert 'remove' in result
        print("It is removed from the perspective of the subscriber")

        # Put the item back
        print("Putting the original context and some other contexts back in")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'replacey': 'place',
                'context': [random_id(), custom_context, random_id()]
            }
        })
        result = await recv_future(ws)
        assert result['update']['replacey'] == 'place'
        print("It is updated from the perspective of the subscriber")

        # Delete it
        print("Removing the item...")
        await send(ws, {
            'messageID': random_id(),
            'remove': base['id']
        })
        result = await recv_future(ws)
        assert 'remove' in result
        print("It is removed from the perspective of the subscriber")

        # Unsubscribe
        print("Unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'unsubscribe': [custom_context]
        })

        # Re add the item
        print("Putting the item back")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'im': 'back',
                'context': [random_id(), custom_context, random_id()]
            }
        })
        timedout = False
        assert not await another_message(ws, recv=recv_future)
        print("The item is not received")

        print("Subscribing to multiple contexts")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context2, custom_context3]
        })

        print("adding an item with the first context")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'two': 'twoey',
                'context': [custom_context2]
            }
        })
        result = await recv_future(ws)
        assert result['update']['two'] == 'twoey'
        print("Received as update")

        print("adding an item with the second context")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'three': 'threey',
                'context': [custom_context3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['three'] == 'threey'
        print("Received as update")

        print("adding an item with both contexts")
        base = object_base(my_id)
        random = random_id()
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'both': 'asdf',
                'context': [random, custom_context2, custom_context3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['both'] == 'asdf'
        print("Received as update")
        assert not await another_message(ws, recv=recv_future)
        print("A second update is not received")

        print("Removing one context from the item with both")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'only': 'one',
                'context': [custom_context3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['only'] == 'one'
        assert result['update']['context'] == [custom_context3]
        print("It is seen as an update")
        result = await recv_future(ws)
        assert result['remove']['id'] == base['id']
        contexts = result['remove']['context']
        assert len(contexts) == 2
        assert random in contexts
        assert custom_context2 in contexts
        print("It is also seen as a removal")

        print("Replacing it entirely")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'nothing': True,
                'context': [random_id()]
            }
        })
        result = await recv_future(ws)
        assert 'remove' in result
        print("It is seen as a removal")
        assert not await another_message(ws, recv=recv_future)
        print("A second update is not received")

        # View private messages from others
        async def listen(id, token):
            async with websocket_connect(token) as ws:
                await send(ws, {
                    'messageID': random_id(),
                    'subscribe': [private_context1, private_context2]
                })

                # See private message
                result = await recv_future(ws)
                assert result['update']['to'] == 'me'

                # See it being deleted
                result = await recv_future(ws)
                assert 'remove' in result

                # See public object
                result = await recv_future(ws)
                assert result['update']['public'] == 'object'

        print("Create a private message to two recipients")
        tasks = []
        users = []
        for i in range(100):
            id, token = actor_id_and_token()
            tasks.append(asyncio.create_task(listen(id, token)))
            users.append(object_base(id)["actor"])

        print("Waiting for them to come online")
        await asyncio.sleep(1)

        print("Creating a private message to the users")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [private_context1, private_context2]
        })
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'to': 'me',
                'context': [private_context2],
                'bcc': users
            }
        })
        result = await recv_future(ws)
        assert result['update']['to'] == 'me'
        print("The sender sees it")

        print("Removing recipients to create a personal object")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'private': 'message',
                'context': [private_context2],
                'bto': []
            }
        })
        result = await recv_future(ws)
        assert result['update']['private'] == 'message'
        print("The sender still sees it")

        print("Making it public")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'public': 'object',
                'context': [private_context1],
            }
        })
        result = await recv_future(ws)
        assert result['update']['public'] == 'object'
        print("The sender still sees it")

        for task in tasks:
            await task
        print("All tasks are good")

if __name__ == "__main__":
    asyncio.run(main())
