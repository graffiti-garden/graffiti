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
        while 'reply' in result or ('historical' in result and result['historical']):
            result = await recv(ws)
        return result

    my_id, my_token = actor_id_and_token()
    async with websocket_connect(my_token) as ws:

        # Subscribe to the tag
        print("Subscribing to tag")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_tag]
        })
        result = await recv(ws)
        assert result['reply'] == 'subscribed'

        print(f"adding an item with the tag {custom_tag}")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'something': 'else',
                'tag': [custom_tag]
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
                'tag': [custom_tag]
            }
        })
        result = await recv_future(ws)
        assert result['update']['how'] == 'r u?'
        print("Received as update")

        print("Adding an item with a different tag")
        base2 = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base2 | {
                'another': 'thing',
                'tag': [random_id()]
            }
        })
        timedout = False
        assert not await another_message(ws, recv=recv_future)
        print("The item is not received")

        print("Replacing the first item's tag")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'another': 'thing',
                'tag': [random_id()]
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
                'tag': [random_id(), custom_tag, random_id()]
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
            'unsubscribe': [custom_tag]
        })

        # Re add the item
        print("Putting the item back")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'im': 'back',
                'tag': [random_id(), custom_tag, random_id()]
            }
        })
        timedout = False
        assert not await another_message(ws, recv=recv_future)
        print("The item is not received")

        print("Subscribing to multiple tags")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_tag2, custom_tag3]
        })

        print("adding an item with the first tag")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'two': 'twoey',
                'tag': [custom_tag2]
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
                'tag': [custom_tag3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['three'] == 'threey'
        print("Received as update")

        print("adding an item with both tags")
        base = object_base(my_id)
        random = random_id()
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'both': 'asdf',
                'tag': [random, custom_tag2, custom_tag3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['both'] == 'asdf'
        print("Received as update")
        assert not await another_message(ws, recv=recv_future)
        print("A second update is not received")

        print("Removing one tag from the item with both")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'only': 'one',
                'tag': [custom_tag3]
            }
        })
        result = await recv_future(ws)
        assert result['update']['only'] == 'one'
        assert result['update']['tag'] == [custom_tag3]
        print("It is seen as an update")
        result = await recv_future(ws)
        assert result['remove']['id'] == base['id']
        tags = result['remove']['tag']
        assert len(tags) == 2
        assert random in tags
        assert custom_tag2 in tags
        print("It is also seen as a removal")

        print("Replacing it entirely")
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'nothing': True,
                'tag': [random_id()]
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
                    'subscribe': [private_tag1, private_tag2]
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
            'subscribe': [private_tag1, private_tag2]
        })
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'to': 'me',
                'tag': [private_tag2],
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
                'tag': [private_tag2],
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
                'tag': [private_tag1],
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
