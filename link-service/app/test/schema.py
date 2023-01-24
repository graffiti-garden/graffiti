#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        for request in valid_requests(my_id):
            await send(ws, request)
            response = await recv(ws)
            # while response["type"] in ["updates", "removes"]:
                # response = await recv(ws)
            if 'error' in response:
                assert response['error'] != "validation"
        print("All valid requests passed, as expected")
        for request in invalid_requests(my_id):
            await send(ws, request)
            response = await recv(ws)
            # while response["type"] in ["updates", "removes"]:
                # response = await recv(ws)
            assert response['error'] == "validation"
        print("All invalid requests failed, as expected")

def valid_requests(my_id):
    base_object = object_base(my_id)
    return [{
    # update
    "messageID": random_id(),
    "object": base_object,
}, {
    "messageID": "alkjd$$\~934820fk",
    "object": base_object,
}, {
    # remove
    "messageID": "a"*64,
    "objectKey": base_object['_key']
}, {
    # subscribe
    "messageID": "iueiruwoeiurowiwf1293  -e 👍",
    "tagsSince": [["hello", "666f6f2d6261722d71757578"]],
}, {
    "messageID": random_id(),
    "tagsSince": [["goodbye", None], ["hello", "666f6f2d6261722d71757578"]],
}, {
    # unsubscribe
    "messageID": random_id(),
    "tags": ["hello"]
}, {
    # List tags
    "messageID": random_id(),
}, {
    # Get
    "messageID": random_id(),
    "objectKey": random_id(),
    "userID": random_sha()
}, {
    # Different sorts of objects
    "messageID": random_id(),
    "object": base_object | {
        "foo": True
    }
}, {
    "messageID": random_id(),
    "object": base_object | {
        "foo": None
    }
}, {
    "messageID": random_id(),
    "object": base_object | {
        "foo": 123.4
    }
}, {
    "messageID": random_id(),
    "object": base_object | {
        "foo": 1234
    }
}, {
    # With _to
    "messageID": random_id(),
    "object": base_object | {
        "_to": [random_sha()]
    }
}, {
    # _to noone ie "private note"
    "messageID": random_id(),
    "object": base_object | {
        "_to": []
    }
}, {
    # To multiple people
    "messageID": random_id(),
    "object": base_object | {
        "_to": [random_sha(), my_id]
    }
}, {
    # Something more complicated
    "messageID": random_id(),
    "object": base_object | {
        "_to": [random_sha(), my_id, random_sha()],
        "foo": {
            "blah": False,
            "bar": {
                "asdf": [ 1234.14 ]
            }
        },
    }
}, {
    # Weird fields
    "messageID": random_id(),
    "object": base_object | {
        "~a": "b",
    }
}, {
    "messageID": random_id(),
    "object": base_object | {
        "asdf": {
            "_kdfj.😘": "🍍"
        },
    }
}]

def invalid_requests(my_id):
    base_object = object_base(my_id)
    return [{}, # Empty
{
    # no message ID
    "object": base_object,
}, {
    # Added extra field
    "messageID": random_id(),
    "object": base_object,
    "foo": "bar"
}, {
    "messageID": random_id(),
    "objectKey": random_id(),
    "bloo": {}
}, {
    "messageID": random_id(),
    "tags": ["asdf"],
    "bug": 1
}, {
    # only special fields can start with _
    "messageID": random_id(),
    "query": {},
    "object": base_object | {
        "_notright": 12345
    },
}, {
    # _key should be an string
    "messageID": random_id(),
    "object": base_object | {
        "_key": 12345,
    }
}, {
    # _key should be < length 64
    "messageID": random_id(),
    "object": base_object | {
        "_key": "z"*65
    }
}, {
    # messageID too long
    "messageID": "q"*65,
    "object": base_object
}, {
    # _to should be an array
    "messageID": random_id(),
    "object": base_object | {
        "_to": random_sha()
    }
}, {
    # _to should by UUIDs
    "messageID": random_id(),
    "object": base_object | {
        "_to": ["12345"]
    }
}, {
    # no repeated IDs
    "messageID": random_id(),
    "object": base_object | {
        "_to": [my_id] + [random_sha()]*2
    }
}, {
    # Object is not an object
    "messageID": random_id(),
    "object": "1234"
}, {
    "messageID": random_id(),
    "object": ["1234"]
}, {
    # Object is missing a field
    "messageID": random_id(),
    "object": {
        '_by': my_id,
        '_tags': ['something']
    }
}, {
    "messageID": random_id(),
    "object": {
        '_key': random_id(),
        '_tags': ['something']
    }
}, {
    "messageID": random_id(),
    "object": {
        '_key': random_id(),
        '_by': my_id,
    }
}, {
    # Tags is not a list
    "messageID": random_id(),
    "object": {
        '_key': random_id(),
        '_tags': 'something'
    }
}, {
    # Tags is not a list of strings
    "messageID": random_id(),
    "object": {
        '_key': random_id(),
        '_tags': [1]
    }
}, {
    # Tags since is not a list
    "messageID": random_id(),
    "tagsSince": "1234"
}, {
    # Tags since is empty
    "messageID": random_id(),
    "tagsSince": []
}, {
    # Tags since is not a list of lists
    "messageID": random_id(),
    "tagsSince": ["hello", "666f6f2d6261722d71757578"],
}, {
    # Tags since entries have too few items
    "messageID": random_id(),
    "tagsSince": [["hello"]]
}, {
    # Tags since entries have too many items
    "messageID": random_id(),
    "tagsSince": [["hello", "666f6f2d6261722d71757578", "asdf"]],
}, {
    # First entry is not a string
    "messageID": random_id(),
    "tagsSince": [[1234, "666f6f2d6261722d71757578"]],
}, {
    # Tags since entries are not a mongo ID
    "messageID": random_id(),
    "tagsSince": [["hello", "why"]],
}]

if __name__ == "__main__":
    asyncio.run(main())
