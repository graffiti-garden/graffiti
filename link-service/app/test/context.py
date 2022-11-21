#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:

        print("creating objects with invalid context")
        base = object_base(my_id)
        # list item out of bounds
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': ['0', '1', '2'],
            },
            'object': base | {
                'foo': ['0', '1', '2'],
                '_inContextIf': [{
                    '_queryFailsWithout': [ 'foo.3' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        # Lists must be indexed by integer
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': ['one', 'two', 'three'],
            },
            'object': base | {
                '_inContextIf': [{
                    '_queryFailsWithout': [ 'foo.one' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        # missing key
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': { 'bar': 'asdf' }
            },
            'object': base | {
                'foo': { 'bar': 'asdf' },
                '_inContextIf': [{
                    '_queryFailsWithout': [ 'foo.notbar' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'
        # context objects must be strings
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': [0, 1, 2],
            },
            'object': base | {
                'foo': [0, 1, 2],
                '_inContextIf': [{
                    '_queryFailsWithout': [ 'foo.2' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'error'

        print("creating objects with valid context")
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': ['0', '1', '2'],
            },
            'object': base | {
                'foo': ['0', '1', '2'],
                '_inContextIf': [{
                    '_queryFailsWithout': [ 'foo.2' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'foo': [0, 1, {
                    'bar': {
                        "asdf": ["hello", "world"]
                    }
                }]
            },
            'object': base | {
                'foo': [0, 1, {
                    'bar': {
                        "asdf": ["hello", "world"]
                    }
                }],
                '_inContextIf': [{
                    '_queryFailsWithout': [ 'foo.2.bar.asdf.1' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("creating an object with limited context")
        common = random_id()
        common2 = random_id()
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'query': {
                'fieldA': common,
                'fieldB': common2,
            },
            'object': base | {
                'fieldA': common,
                'fieldB': common2,
                '_inContextIf': [{
                    '_queryFailsWithout': ['fieldA', 'fieldB']
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await send(ws, {
            'messageID': random_id(),
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
        print("unable to search for it")

        print("creating an object with open context")
        common = random_id()
        base = object_base(my_id)
        await send(ws, {
            'messageID': random_id(),
            'query': {},
            'object': base | {
                'fieldA': common,
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        await send(ws, {
            'messageID': random_id(),
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
            'query': {
                'fieldB': special,
            },
            'object': base | {
                'fieldA': common,
                'fieldB': special,
                '_inContextIf': [{
                    '_queryFailsWithout': [ 'fieldB' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("querying without context")
        await send(ws, {
            'messageID': random_id(),
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
            'query': {},
            'object': base | {
                'fieldA': common,
                'fieldB': special,
                '_inContextIf': [{
                    '_queryPassesWithout': [ 'fieldB' ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("querying without context")
        await send(ws, {
            'messageID': random_id(),
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
            'query': {
                'tags': [a, b, c],
            },
            'object': base | {
                'tags': [a, b, c],
                '_inContextIf': [{
                    # If removing a, b OR c falsifies the query
                    '_queryFailsWithout': [ 'tags.0', 'tags.1', 'tags.2' ]
                }, {
                    '_queryPassesWithout': [
                        [ 'tags.0', 'tags.1', ],
                        [ 'tags.0', 'tags.2', ],
                        [ 'tags.1', 'tags.2', ]
                    ],
                    # If removing a, b AND c falsifies the query
                    '_queryFailsWithout': [ [ 'tags.0', 'tags.1', 'tags.2' ] ]
                }]
            }
        })
        result = await recv(ws)
        assert result['type'] == 'success'

        print("querying for intersection")
        await send(ws, {
            'messageID': random_id(),
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
