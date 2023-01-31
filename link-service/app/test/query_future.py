#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    custom_tag = random_id()
    custom_tag2 = random_id()
    custom_tag3 = random_id()
    private_tag1 = random_id()
    private_tag2 = random_id()

    async def recv_future(ws):
        result = {'reply'}
        while 'reply' in result:
            result = await recv(ws)
        return result

    async def another_message(ws):
        try:
            async with asyncio.timeout(0.1):
                await recv_future(ws)
        except TimeoutError:
            return False
        else:
            return True

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:

        # Subscribe to the tag
        print("Subscribing to tag")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [[custom_tag, None]]
        })
        result = await recv_future(ws)
        assert 'historyComplete' in result

        print("adding an item with the tag")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'something': 'else',
                '_tags': [custom_tag]
            }
        })
        result = await recv_future(ws)
        assert result['update']['something'] == 'else'
        now = result['now']
        print("Received as update")

        print("Adding another item")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'how': 'r u?',
                '_tags': [custom_tag]
            }
        })
        result = await recv_future(ws)
        assert result['update']['how'] == 'r u?'
        print("Received as update")

        # Unsubscribe
        print("Unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'unsubscribe': [custom_tag]
        })

        print("Resubscribing 'after' first item was added")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [[custom_tag, now]]
        })
        result = await recv_future(ws)
        assert result['update']['how'] == 'r u?'
        result = await recv_future(ws)
        assert 'historyComplete' in result

        print("Adding an item with a different tag")
        base2 = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base2 | {
                'another': 'thing',
                '_tags': [random_id()]
            }
        })
        timedout = False
        assert not await another_message(ws)
        print("The item is not received")

        print("Replacing the first item's tag")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'another': 'thing',
                '_tags': [random_id()]
            }
        })
        result = await recv_future(ws)
        assert 'remove' in result
        print("It is removed from the perspective of the subscriber")

        # Put the item back
        print("Putting the original tag and some other tags back in")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'replacey': 'place',
                '_tags': [random_id(), custom_tag, random_id()]
            }
        })
        result = await recv_future(ws)
        assert result['update']['replacey'] == 'place'
        print("It is updated from the perspective of the subscriber")

        # Delete it
        print("Removing the item...")
        await send(ws, {
            'messageID': random_id(),
            'remove': base['_key']
        })
        result = await recv_future(ws)
        assert 'remove' in result
        print("It is removed from the perspective of the subscriber")

        # Unsubscribe
        print("Unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'unsubscribe': [custom_tag]
        })

        # Re add the item
        print("Putting the item back")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'im': 'back',
                '_tags': [random_id(), custom_tag, random_id()]
            }
        })
        timedout = False
        assert not await another_message(ws)
        print("The item is not received")

        print("Subscribing to multiple tags")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [[custom_tag2, None], [custom_tag3, None]]
        })
        result = await recv_future(ws)
        assert 'historyComplete' in result

        print("adding an item with the first tag")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'two': 'twoey',
                '_tags': [custom_tag2]
            }
        })
        result = await recv_future(ws)
        assert result['update']['two'] == 'twoey'
        print("Received as update")

        print("adding an item with the second tag")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'three': 'threey',
                '_tags': [custom_tag3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['three'] == 'threey'
        print("Received as update")

        print("adding an item with both tags")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'both': 'asdf',
                '_tags': [random_id(), custom_tag2, custom_tag3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['both'] == 'asdf'
        print("Received as update")
        assert not await another_message(ws)
        print("A second update is not received")

        print("Removing one tag from the item with both")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'only': 'one',
                '_tags': [custom_tag3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['only'] == 'one'
        print("It is seen as an update")
        assert not await another_message(ws)
        print("A second update is not received")

        print("Replacing it entirely")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'nothing': True,
                '_tags': [random_id()]
            }
        })
        result = await recv_future(ws)
        assert 'remove' in result
        print("It is seen as a removal")
        assert not await another_message(ws)
        print("A second update is not received")

        # View private messages from others
        async def listen(id, token):
            async with websocket_connect(token) as ws:
                await send(ws, {
                    'messageID': random_id(),
                    'subscribe': [[private_tag1, None], [private_tag2, None]]
                })
                result = await recv_future(ws)
                assert 'historyComplete' in result

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
            id, token = owner_id_and_token()
            tasks.append(asyncio.create_task(listen(id, token)))
            users.append(id)

        print("Waiting for them to come online")
        await asyncio.sleep(1)

        print("Creating a private message to the users")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [[private_tag1, None], [private_tag2, None]]
        })
        result = await recv_future(ws)
        assert 'historyComplete' in result
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'to': 'me',
                '_tags': [private_tag2],
                '_to': users
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
                '_tags': [private_tag2],
                '_to': []
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
                '_tags': [private_tag1],
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
