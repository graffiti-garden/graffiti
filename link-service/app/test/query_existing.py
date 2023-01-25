#!/usr/bin/env python3

import asyncio
from utils import *
import time

async def main():

    custom_tag = random_id()
    custom_tag2 = random_id()

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        print("adding 10 objects")
        for i in range(10):
            base = object_base(my_id)
            await send(ws, {
                'messageID': random_id(),
                'object': base | {
                    '_tags': [custom_tag],
                    'content': random_id(),
                }
            })
            result = await recv(ws)
            assert result['reply'] == 'inserted'
        print("...added")

        print("querying for them")
        await send(ws, {
            'messageID': random_id(),
            'tagsSince': [
                [custom_tag, None]
            ]
        })
        result = await recv(ws)
        assert result['reply'] == 'subscribed'
        for i in range(10):
            result = await recv(ws)
            assert 'update' in result
            assert result['update']['_tags'] == [custom_tag]
            now = result['now']
        result = await recv(ws)
        assert 'tagsSince' in result
        print("...received")

        # Try subscribing again
        await send(ws, {
            'messageID': random_id(),
            'tagsSince': [
                [custom_tag, None]
            ]
        })
        result = await recv(ws)
        assert 'error' in result
        print("Could not subscribe again")

        print("unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'tags': [custom_tag]
        })
        result = await recv(ws)
        assert result['reply'] == 'unsubscribed'

        # Try unsubscribing again
        await send(ws, {
            'messageID': random_id(),
            'tags': [custom_tag]
        })
        result = await recv(ws)
        assert 'error' in result
        print("Could not unsubscribe again")

        # Add some more objects with one and more than one tag
        print("Inserting objects with multiple tags")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'object': base | {
                '_tags': [custom_tag],
                'something': 'one'
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'object': base | {
                '_tags': [custom_tag2, custom_tag],
                'something': 'two'
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'

        # Subscribe again and only query for recently added objects of 1st tag
        print("Subscribe to events since last query")
        await send(ws, {
            'messageID': random_id(),
            'tagsSince': [
                [custom_tag, now]
            ]
        })
        result = await recv(ws)
        assert result['reply'] == 'subscribed'

        # Objects arrive in reverse chronological order
        result = await recv(ws)
        assert result['update']['something'] == 'two'
        now2 = result['now']
        result = await recv(ws)
        assert result['update']['something'] == 'one'
        result = await recv(ws)
        assert 'tagsSince' in result
        print("...received")

        # Unsubscribe
        print("unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'tags': [custom_tag]
        })
        result = await recv(ws)
        assert result['reply'] == 'unsubscribed'

        # Add more objects with both tags
        print("Inserting more objects with multiple tags")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'object': base | {
                '_tags': [custom_tag2],
                'something': 'three'
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'object': base | {
                '_tags': [custom_tag],
                'something': 'four'
            }
        })
        result = await recv(ws)
        assert result['reply'] == 'inserted'

        print("Subscribe to both tags with different sinces")
        await send(ws, {
            'messageID': random_id(),
            'tagsSince': [
                [custom_tag2, now],
                [custom_tag, now2]
            ]
        })
        result = await recv(ws)
        assert result['reply'] == 'subscribed'
        result = await recv(ws)
        assert result['update']['something'] == 'four'
        result = await recv(ws)
        assert result['update']['something'] == 'three'
        result = await recv(ws)
        assert result['update']['something'] == 'two'
        result = await recv(ws)
        assert 'tagsSince' in result
        print("Received both new results but only one older result as expected")

        # TODO
        # Try private messaging

if __name__ == "__main__":
    asyncio.run(main())
