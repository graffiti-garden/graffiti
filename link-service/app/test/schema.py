#!/usr/bin/env python3

import asyncio
from utils import *
import datetime

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        for request in valid_requests(my_id):
            await send(ws, request)
            response = await recv(ws)
            while ('error' not in response) and ('messageID' not in response):
                response = await recv(ws)
            if 'error' in response:
                assert response['error'] != "validation"
        print("All valid requests passed, as expected")
        for request in invalid_requests(my_id):
            await send(ws, request)
            response = await recv(ws)
            while ('error' not in response) and ('messageID' not in response):
                response = await recv(ws)
            assert response['error'] == "validation"
        print("All invalid requests failed, as expected")

def valid_requests(my_id):
    base_object = object_base(my_id)
    return [{
    # update
    "messageID": random_id(),
    "update": base_object,
}, {
    "messageID": "alkjd$$\~934820fk",
    "update": base_object,
}, {
    # remove
    "messageID": "a"*64,
    "remove": base_object['_key']
}, {
    # subscribe
    "messageID": "iueiruwoeiurowiwf1293  -e 👍",
    "subscribe": [["hello", "2018-11-13T20:20:39+00:00"]]
}, {
    "messageID": random_id(),
    "subscribe": [["goodbye", None], ["hello", datetime.datetime.fromtimestamp(0, tz=datetime.timezone.utc).isoformat(timespec='microseconds')]]
}, {
    # unsubscribe
    "messageID": random_id(),
    "unsubscribe": ["hello"]
}, {
    "messageID": random_id(),
    "unsubscribe": ["hello", "eriu", "alksdf"]
}, {
    # List tags
    "messageID": random_id(),
    "ls": None
}, {
    # Get
    "messageID": random_id(),
    "get": {
        "_by": random_sha(),
        "_key": random_id()
    }
}, {
    # Different sorts of objects
    "messageID": random_id(),
    "update": base_object | {
        "foo": True
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "foo": None
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "foo": 123.4
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "foo": 1234
    }
}, {
    # Various tags
    "messageID": random_id(),
    "update": base_object | {
        "_tags": ["aksjfdkd", "1"*1000, "😠"]
    }
}, {
    # With _to
    "messageID": random_id(),
    "update": base_object | {
        "_to": [random_sha()]
    }
}, {
    # _to noone ie "private note"
    "messageID": random_id(),
    "update": base_object | {
        "_to": []
    }
}, {
    # To multiple people
    "messageID": random_id(),
    "update": base_object | {
        "_to": [random_sha(), my_id]
    }
}, {
    # Something more complicated
    "messageID": random_id(),
    "update": base_object | {
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
    "update": base_object | {
        "~a": "b",
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
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
    "update": base_object,
}, {
    # Added extra field
    "messageID": random_id(),
    "update": base_object,
    "foo": "bar"
}, {
    # Multiple commands at once
    "messageID": random_id(),
    "update": base_object,
    "ls": None
}, {
    # only special fields can start with _
    "messageID": random_id(),
    "update": base_object | {
        "_notright": 12345
    },
}, {
    # _key should be an string
    "messageID": random_id(),
    "update": base_object | {
        "_key": 12345,
    }
}, {
    # _key should be < length 64
    "messageID": random_id(),
    "update": base_object | {
        "_key": "z"*65
    }
}, {
    # messageID too long
    "messageID": "q"*65,
    "update": base_object
}, {
    # _to should be an array
    "messageID": random_id(),
    "update": base_object | {
        "_to": random_sha()
    }
}, {
    # _to should by UUIDs
    "messageID": random_id(),
    "update": base_object | {
        "_to": ["12345"]
    }
}, {
    # no repeated IDs
    "messageID": random_id(),
    "update": base_object | {
        "_to": [my_id] + [random_sha()]*2
    }
}, {
    # Object is not an object
    "messageID": random_id(),
    "update": "1234"
}, {
    "messageID": random_id(),
    "update": ["1234"]
}, {
    # Object is missing a field
    "messageID": random_id(),
    "update": {
        '_by': my_id,
        '_tags': ['something']
    }
}, {
    "messageID": random_id(),
    "update": {
        '_key': random_id(),
        '_tags': ['something']
    }
}, {
    "messageID": random_id(),
    "update": {
        '_key': random_id(),
        '_by': my_id,
    }
}, {
    # Tags is not a list
    "messageID": random_id(),
    "update": {
        '_key': random_id(),
        '_tags': 'something'
    }
}, {
    # Tags is not a list of strings
    "messageID": random_id(),
    "update": {
        '_key': random_id(),
        '_tags': [1]
    }
}, {
    # Tags since is not a list
    "messageID": random_id(),
    "subscribe": "1234"
}, {
    # Tags since is empty
    "messageID": random_id(),
    "subscribe": []
}, {
    # Tags since is not a list of lists
    "messageID": random_id(),
    "subscribe": ["hello", None]
}, {
    # Tags since entries have too few items
    "messageID": random_id(),
    "subscribe": [["hello"]]
}, {
    # Tags since entries have too many items
    "messageID": random_id(),
    "subscribe": [["hello", None, "asdf"]],
}, {
    # First entry is not a string
    "messageID": random_id(),
    "subscribe": [[1234, None]]
}, {
    # Tags since date isn't right
    "messageID": random_id(),
    "subscribe": [["hello", "1234"]]
}, {
    # Get missing a field
    "messageID": random_id(),
    "get": {
        "_by": random_sha(),
    }
}, {
    "messageID": random_id(),
    "get": {
        "_key": random_id()
    }
}, {
    # Get includes an extra field
    "messageID": random_id(),
    "get": {
        "hi": "asdf",
        "_by": random_sha(),
        "_key": random_id()
    }
}, {
    # Unsubscribe is not a list of strings
    "messageID": random_id(),
    "unsubscribe": "asdf"
}, {
    "messageID": random_id(),
    "unsubscribe": []
}, {
    "messageID": random_id(),
    "unsubscribe": [1]
}, {
    # LS is anything but none
    "messageID": random_id(),
    "ls": 1
}]

if __name__ == "__main__":
    asyncio.run(main())
