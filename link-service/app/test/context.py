#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:

        print("creating an object with one near miss")
        common = random_id()
        special = random_id()
        base_object, proof = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof,
            'object': base_object | {
                'fieldA': common,
                'fieldB': special,
                '_contexts': [{
                    '_nearMisses': [{
                        'fieldA': common,
                        'fieldB': 'not' + special
                    }]
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
        base_object, proof = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof,
            'object': base_object | {
                'fieldA': common,
                'fieldB': special,
                '_contexts': [{
                    '_neighbors': [{
                        'fieldA': common,
                        'fieldB': 'not' + special
                    }]
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
        base_object, proof = object_base_and_proof(my_id)
        await send(ws, {
            'messageID': random_id(),
            'type': 'update',
            'idProof': proof,
            'object': base_object | {
                'tags': [a, b, c],
                '_contexts': [{
                    # If the query is for a, b, AND c
                    '_nearMisses': [{
                        'tags': [random_id(), b, c],
                    }, {
                        'tags': [a, random_id(), c],
                    }, {
                        'tags': [a, b, random_id()],
                    }]
                }, {
                    # If the query is for a, b, OR c
                    '_neighbors': [{
                        'tags': [a]
                    }, {
                        'tags': [b]
                    }, {
                        'tags': [c]
                    }],
                    '_nearMisses': [{
                        'tags': [random_id()]
                    }]
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
