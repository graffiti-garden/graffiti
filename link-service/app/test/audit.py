#!/usr/bin/env python3

import asyncio
from utils import *
from os import getenv
import time

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        custom_tag = random_id()
        custom_tag2 = random_id()
        query_id = random_id()

        print("Adding an object with restrictive context")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': custom_tag,
                'bar': custom_tag2
            },
            'object': base | {
                'foo': custom_tag,
                'bar': custom_tag2,
                '_inContextIf': [{
                    '_queryFailsWithout': ['foo', 'bar']
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        print("done")

        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': custom_tag,
                "_audit": False
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
        print("can't query for it out of context")

        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': custom_tag,
                "_audit": True
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
        print("can audit it")

        print("adding an object with a different account")
        other_id, other_token = owner_id_and_token()
        custom_tag = random_id()
        custom_tag2 = random_id()
        async with websocket_connect(other_token) as other_ws:
            base = object_base(other_id)
            await send(other_ws, {
                'messageID': random_id(),
                'query': {
                    'foo': custom_tag,
                    'bar': custom_tag2
                },
                'object': base | {
                    'foo': custom_tag,
                    'bar': custom_tag2,
                    '_inContextIf': [{
                        '_queryFailsWithout': ['foo', 'bar']
                    }]
                }
            })
            result = await recv(other_ws)
            assert result['type'] == 'success'
            print("done")

            await send(other_ws, {
                'messageID': random_id(),
                'query': {
                    'foo': custom_tag,
                    "_audit": True
                },
                "since": None,
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
            'query': {
                'foo': custom_tag,
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
            'query': {
                'foo': custom_tag,
                "_audit": True
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
        print("can't audit it either")

if __name__ == "__main__":
    asyncio.run(main())
