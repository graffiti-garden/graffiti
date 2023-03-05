#!/usr/bin/env python3

import asyncio
from utils import *
import time

async def recv_historical(ws):
    result = { 'update': {}, 'historical': False }
    while 'update' in result and not result['historical']:
        result = await recv(ws)
    return result

async def main():

    custom_context = random_id()
    custom_context2 = random_id()
    custom_context4 = random_id()
    custom_context3 =  random_id()

    my_id, my_token = actor_id_and_token()
    other_id, other_token = actor_id_and_token()
    another_id, another_token = actor_id_and_token()

    async with websocket_connect(my_token) as ws:
        print("adding 1 object")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'context': [random_id()],
                'content': 'single'
            }
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'inserted'

        print("querying for it by it's ID")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [base["id"]]
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'subscribed'
        result = await recv_historical(ws)
        assert 'update' in result
        assert result['update']['content'] == 'single'
        print("...got it")

        print("adding 10 objects")
        for i in range(10):
            base = object_base(my_id)
            await send(ws, {
                'messageID': random_id(),
                'update': base | {
                    'context': [custom_context],
                    'content': random_id(),
                }
            })
            result = await recv_historical(ws)
            assert result['reply'] == 'inserted'
        print("...added")

        print("querying for them")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context]
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'subscribed'
        for i in range(10):
            result = await recv_historical(ws)
            assert 'update' in result
            assert result['update']['context'] == [custom_context]
        print("...received")

        # Try subscribing again
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context]
        })
        result = await recv_historical(ws)
        assert 'error' in result
        print("Could not subscribe again")

        print("unsubscribing")
        await send(ws, {
            'messageID': random_id(),
            'unsubscribe': [custom_context]
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'unsubscribed'

        # Try unsubscribing again
        await send(ws, {
            'messageID': random_id(),
            'unsubscribe': [custom_context]
        })
        result = await recv_historical(ws)
        assert 'error' in result
        print("Could not unsubscribe again")

        # Adding items with multiple contexts and combinations
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'context': [custom_context2],
                'something': 'one'
            }
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'inserted'
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'context': [custom_context4],
                'something': 'two'
            }
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'inserted'
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'context': [custom_context4, custom_context2],
                'something': 'three'
            }
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'inserted'
        print("...added")

        # Try subscribing again
        print("Subscribing to the contexts")
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context2, custom_context4]
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'subscribed'
        results = [ await recv_historical(ws) for i in range(3) ]
        outputs = [ result["update"]["something"] for result in results ]
        assert 'one' in outputs
        assert 'two' in outputs
        assert 'three' in outputs
        print("All results received")
        assert not await another_message(ws, recv=recv_historical)
        print("no more results received")

        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'update': base | {
                'content': 'qwerty',
                'context': [custom_context3],
                'bto': [object_base(other_id)["actor"]]
            }
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'inserted'
        print("Created a private object")

        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context3]
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'subscribed'
        result = await recv_historical(ws)
        assert result['update']['content'] == 'qwerty'
        print("Creator can see it")

    async with websocket_connect(other_token) as ws:

        # Recipient can see it
        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context3]
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'subscribed'
        result = await recv_historical(ws)
        assert result['update']['content'] == 'qwerty'
        print("Recipient can see it")

    async with websocket_connect(another_token) as ws:

        await send(ws, {
            'messageID': random_id(),
            'subscribe': [custom_context3]
        })
        result = await recv_historical(ws)
        assert result['reply'] == 'subscribed'
        assert not await another_message(ws, recv=recv_historical)
        print("Snoop cannot see it")

if __name__ == "__main__":
    asyncio.run(main())
