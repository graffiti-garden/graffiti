#!/usr/bin/env python3

import asyncio
from utils import *
import datetime

async def main():

    my_actor, my_token = actor_id_and_token()
    async with websocket_connect(my_token) as ws:
        for request in valid_requests(my_actor):
            await send(ws, request)
            response = await recv(ws)
            while ('error' not in response) and ('messageID' not in response):
                response = await recv(ws)
            if 'error' in response:
                assert response['error'] != "validation"
        print("All valid requests passed, as expected")
        for request in invalid_requests(my_actor):
            await send(ws, request)
            response = await recv(ws)
            while ('error' not in response) and ('messageID' not in response):
                response = await recv(ws)
            assert response['error'] == "validation"
        print("All invalid requests failed, as expected")

def valid_requests(my_actor):
    base_object = object_base(my_actor)
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
    "remove": base_object['id']
}, {
    # subscribe
    "messageID": "iueiruwoeiurowiwf1293  -e 👍",
    "subscribe": ["hello"]
}, {
    "messageID": random_id(),
    "subscribe": ["goodbye", "hello"]
}, {
    # unsubscribe
    "messageID": random_id(),
    "unsubscribe": ["hello"]
}, {
    "messageID": random_id(),
    "unsubscribe": ["hello", "eriu", "alksdf"]
}, {
    # List contexts
    "messageID": random_id(),
    "ls": None
}, {
    # Get
    "messageID": random_id(),
    "get": f"graffitiobject://{random_sha()}:{random_id()}"
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
    # Various contexts
    "messageID": random_id(),
    "update": base_object | {
        "context": ["aksjfdkd", "1"*1000, "😠"]
    }
}, {
    # With bto/bcc
    "messageID": random_id(),
    "update": base_object | {
        "bto": [random_actor()]
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "bcc": [random_actor()]
    }
}, {
    # _to noone ie "private note"
    "messageID": random_id(),
    "update": base_object | {
        "bto": []
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "bcc": []
    }
}, {
    # To multiple people
    "messageID": random_id(),
    "update": base_object | {
        "bto": [random_actor(), base_object["actor"]]
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "bcc": [base_object["actor"], random_actor(), random_actor()]
    }
}, {
    # Something more complicated
    "messageID": random_id(),
    "update": base_object | {
        "bto": [random_actor(), base_object["actor"], random_actor()],
        "bcc": [random_actor()],
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

def invalid_requests(my_actor):
    base_object = object_base(my_actor)
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
    # id should be an string
    "messageID": random_id(),
    "update": base_object | {
        "id": 12345,
    }
}, {
    # id improperly formatted
    # Wrong scheme
    "messageID": random_id(),
    "update": base_object | {
        "id": 'G' + base_object['id'][1:]
    }
}, {
    # URL appended
    "messageID": random_id(),
    "update": base_object | {
        "id": "asdf" + base_object['id']
    }
}, {
    # Key is too long
    "messageID": random_id(),
    "update": base_object | {
        "id": base_object['id'] + "z"*65
    }
}, {
    # messageID too long
    "messageID": "q"*65,
    "update": base_object
}, {
    # bto/bcc should be an array
    "messageID": random_id(),
    "update": base_object | {
        "bto": random_actor()
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "bcc": random_actor()
    }
}, {
    # bto/bcc should by UUIDs
    "messageID": random_id(),
    "update": base_object | {
        "bto": ["12345"]
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "bcc": ["12345"]
    }
}, {
    # no repeated IDs
    "messageID": random_id(),
    "update": base_object | {
        "bto": [random_actor()]*2
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "bcc": [random_actor()]+[base_object["actor"]]*2
    }
}, {
    # Improperly formatted actor
    "messageID": random_id(),
    "update": base_object | {
        "bto": ["G"+random_actor()[1:]]
    }
}, {
    "messageID": random_id(),
    "update": base_object | {
        "bto": [random_actor() + "1"]
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
        'actor': my_actor,
        'context': ['something']
    }
}, {
    "messageID": random_id(),
    "update": {
        'id': base_object['id'],
        'context': ['something']
    }
}, {
    "messageID": random_id(),
    "update": {
        'id': base_object['id'],
        'actor': my_actor,
    }
}, {
    # Tags is not a list
    "messageID": random_id(),
    "update": base_object | {
        'context': 'something'
    }
}, {
    # Tags is not a list of strings
    "messageID": random_id(),
    "update": base_object | {
        'context': [1]
    }
}, {
    # Tags is not a list
    "messageID": random_id(),
    "subscribe": "1234"
}, {
    # Tags is empty
    "messageID": random_id(),
    "subscribe": []
}, {
    # entries are not strings
    "messageID": random_id(),
    "subscribe": [1234]
}, {
    # Get is not a string
    "messageID": random_id(),
    "get": 12345
}, {
    # Get is ill-formed
    "messageID": random_id(),
    "get": "G" + base_object['id'][1:]
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
