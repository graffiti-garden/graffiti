#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:

        print("creating objects with invalid context")
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'foo': [0, 1, 2],
                '_contexts': [{
                    '_nearMisses': [ 
                        [ ['foo', 3] ]
                    ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'

        print("creating objects with valid context")
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'foo': [0, 1, 2],
                '_contexts': [{
                    '_nearMisses': [ 
                        [ ['foo', 2] ]
                    ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'foo': [0, 1, {
                    'bar': {
                        "asdf": ["hello", "world"]
                    }
                }],
                '_contexts': [{
                    '_nearMisses': [ 
                        [ ['foo', 2, 'bar', 'asdf', 1] ]
                    ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("creating an object with no context")
        common = random_id()
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'fieldA': common,
                '_contexts': []
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldA': common,
                '_to': my_id
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1
        print("able to find it by '_to'")

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldA': common,
                '_id': base['_id']
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1
        print("able to find it by '_id'")

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldA': common
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 0
        print("unable to search for it otherwise")

        print("creating an object with open context")
        common = random_id()
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'fieldA': common,
                '_contexts': [{}] # here
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldA': common
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1
        print("able to find it")

        print("creating an object with one near miss")
        common = random_id()
        special = random_id()
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'fieldA': common,
                'fieldB': special,
                '_contexts': [{
                    '_nearMisses': [ 
                        [ ['fieldB'] ]
                    ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("querying without context")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldA': common
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 0

        print("querying with context")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldB': special
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1

        print("creating an object with one neighbor")
        common = random_id()
        special = random_id()
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'fieldA': common,
                'fieldB': special,
                '_contexts': [{
                    '_neighbors': [
                        [ ['fieldB'] ]
                    ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("querying without context")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldA': common
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1

        print("querying with context")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'fieldB': special
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 0

        print("creating an object with complex context")
        a = random_id()
        b = random_id()
        c = random_id()
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'object': base | {
                'tags': [a, b, c],
                '_contexts': [{
                    # If the query is for a, b, AND c
                    '_nearMisses': [
                        [ ['tags', 0] ],
                        [ ['tags', 1] ],
                        [ ['tags', 2] ]
                    ]
                }, {
                    # If the query is for a, b, OR c
                    '_neighbors': [
                        [ ['tags', 1], ['tags', 2] ],
                        [ ['tags', 0], ['tags', 2] ],
                        [ ['tags', 0], ['tags', 1] ]
                    ],
                    '_nearMisses': [
                        [ ['tags', 0], ['tags', 1], ['tags', 2] ]
                    ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("querying for intersection")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'tags': { '$all': [a, b, c] }
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1

        print("querying for union")
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {
                'tags': { '$elemMatch': { '$in': [a, b, c] } }
            },
            'since': None,
            'queryID': random_id()
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        result = await recv(ws)
        assert result['type'] == 'updates'
        assert len(result['results']) == 1

        print("querying for intersections and unions of subsets")
        for subset in [ [a, b], [a, c], [a, b] ]:
            await send(ws, {
                'messageID': random_id(),
                'type': 'subscribe',
                'query': {
                    'tags': { '$all': subset }
                },
                'since': None,
                'queryID': random_id()
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            result = await recv(ws)
            assert result['type'] == 'updates'
            assert len(result['results']) == 0

            await send(ws, {
                'messageID': random_id(),
                'type': 'subscribe',
                'query': {
                    'tags': { '$elemMatch': { '$in': subset } }
                },
                'since': None,
                'queryID': random_id()
            })
            result = await recv(ws)
            assert result['type'] == 'success'
            result = await recv(ws)
            assert result['type'] == 'updates'
            assert len(result['results']) == 0

if __name__ == "__main__":
    asyncio.run(main())
