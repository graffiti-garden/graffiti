#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    id_a, token_a = owner_id_and_token()
    id_b, token_b = owner_id_and_token()
    id_c, token_c = owner_id_and_token()
    async with websocket_connect(token_a) as ws_a:
        async with websocket_connect(token_b) as ws_b:
            async with websocket_connect(token_c) as ws_c:

                print("A creates an object to B")
                special = random_id()
                await send(ws_a, {
                    'messageID': random_id(),
                    'query': {},
                    'object': object_base(id_a) | {
                        'special': special,
                        '_to': [ id_b ]
                    }
                })
                result = await recv(ws_a)
                assert result['type'] == 'success'

                await send(ws_a, {
                    'messageID': random_id(),
                    'query': {
                        'special': special
                    },
                    'since': None,
                    'queryID': random_id()
                })
                result = await recv(ws_a)
                assert result['type'] == 'success'
                result = await recv(ws_a)
                assert result['type'] == 'updates'
                assert len(result['results']) == 1
                print("It can be read by A")

                await send(ws_b, {
                    'messageID': random_id(),
                    'query': {
                        'special': special
                    },
                    'since': None,
                    'queryID': random_id()
                })
                result = await recv(ws_b)
                assert result['type'] == 'success'
                result = await recv(ws_b)
                assert result['type'] == 'updates'
                assert len(result['results']) == 1
                print("It can be read by B")

                await send(ws_c, {
                    'messageID': random_id(),
                    'query': {
                        'special': special
                    },
                    'since': None,
                    'queryID': random_id()
                })
                result = await recv(ws_c)
                assert result['type'] == 'success'
                result = await recv(ws_c)
                assert result['type'] == 'updates'
                assert len(result['results']) == 0
                print("It cannot be read by C")

                print("A creates an object to B and c")
                special = random_id()
                await send(ws_a, {
                    'messageID': random_id(),
                    'query': {},
                    'object': object_base(id_a) | {
                        'special': special,
                        '_to': [ id_b, id_c ]
                    }
                })
                result = await recv(ws_a)
                assert result['type'] == 'success'

                await send(ws_b, {
                    'messageID': random_id(),
                    'query': {
                        'special': special,
                        '_to': id_c
                    },
                    'since': None,
                    'queryID': random_id()
                })
                result = await recv(ws_b)
                assert result['type'] == 'success'
                result = await recv(ws_b)
                assert result['type'] == 'updates'
                assert len(result['results']) == 1
                print("B queries for objects to C and finds it")

                print("A creates an object to B with context")
                special = random_id()
                tag = random_id()
                await send(ws_a, {
                    'messageID': random_id(),
                    'query': {
                        'tag': tag
                    },
                    'object': object_base(id_a) | {
                        'special': special,
                        'tag': tag,
                        '_to': [ id_b ],
                        '_inContextIf': [{
                            '_queryFailsWithout': [ 'tag' ]
                        }]
                    }
                })
                result = await recv(ws_a)
                assert result['type'] == 'success'

                await send(ws_b, {
                    'messageID': random_id(),
                    'query': {
                        'special': special
                    },
                    'since': None,
                    'queryID': random_id()
                })
                result = await recv(ws_b)
                assert result['type'] == 'success'
                result = await recv(ws_b)
                assert result['type'] == 'updates'
                assert len(result['results']) == 0
                print("B can't find it in an open query")

                await send(ws_b, {
                    'messageID': random_id(),
                    'query': {
                        'tag': tag,
                        'special': special
                    },
                    'since': None,
                    'queryID': random_id()
                })
                result = await recv(ws_b)
                assert result['type'] == 'success'
                result = await recv(ws_b)
                assert result['type'] == 'updates'
                assert len(result['results']) == 1
                print("B can find it in a specific query")

                await send(ws_c, {
                    'messageID': random_id(),
                    'query': {
                        'tag': tag,
                        'special': special
                    },
                    'since': None,
                    'queryID': random_id()
                })
                result = await recv(ws_c)
                assert result['type'] == 'success'
                result = await recv(ws_c)
                assert result['type'] == 'updates'
                assert len(result['results']) == 0
                print("C can't find it with a specific query")

if __name__ == "__main__":
    asyncio.run(main())
