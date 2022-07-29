#!/usr/bin/env python3

import asyncio
from utils import *
from os import getenv
import time

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        custom_tag = random_id()
        query_id = random_id()

        print("Adding an object without context")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'foo': custom_tag,
                '_inContextIf': []
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("done")

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'foo': custom_tag
            },
            "since": None,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 0
        print("can't query for it")

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'foo': custom_tag
            },
            "since": None,
            "audit": True,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 1
        print("can audit it")

        print("adding an object with a different account")
        other_id, other_token = owner_id_and_token()
        custom_tag2 = random_id()
        async with websocket_connect(other_token) as other_ws:
            base = object_base(other_id)
            await send(other_ws, {
                'messageID': random_id(),
                'type': 'update',
                'object': base | {
                    'foo': custom_tag2,
                    '_inContextIf': []
                }
            })
            result = await recv(other_ws)
            assert result['type'] == 'success'
            print("done")

            await send(other_ws, {
                'messageID': random_id(),
                'type': 'subscribe',
                'query': {
                    'foo': custom_tag2
                },
                "since": None,
                "audit": True,
                "queryID": query_id
            })
            result = await recv(other_ws)
            assert result['type'] == 'success'
            result = await recv(other_ws)
            assert result['type'] == 'updates'
            assert result['complete']
            assert len(result['results']) == 1
            print("the other account can audit it")

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'foo': custom_tag2
            },
            "since": None,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 0
        print("can't query for it")

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'foo': custom_tag2
            },
            "since": None,
            "audit": True,
            "queryID": query_id
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert result['complete']
        assert len(result['results']) == 0
        print("can't audit it either")

if __name__ == "__main__":
    asyncio.run(main())
