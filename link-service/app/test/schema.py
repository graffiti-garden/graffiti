#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = id_and_token()
    async with websocket_connect(my_token) as ws:
        for request in valid_requests(my_id):
            await send(ws, request)
            response = await recv(ws)
            assert response["type"] != "validationError"
        print("All valid requests passed, as expected")
        for request in invalid_requests:
            await send(ws, request)
            response = await recv(ws)
            assert response["type"] == "validationError"
        print("All invalid requests failed, as expected")

def valid_requests(my_id):
    return [{
    "messageID": random_id(),
    "type": "update",
    "object": {}
}, {
    "messageID": random_id(),
    "type": "delete",
    "objectID": random_id()
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "query": {}
}, {
    "messageID": random_id(),
    "type": "unsubscribe",
    "queryHash": random_id()
}, {
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_id": random_id(),
        "_to": [random_id(), random_id()],
        "_timestamp": 12345,
        "foo": {
            "blah": "asdf",
            "bar": {
                "_timestamp": 6789
            }
        },
        "_contexts": [{
            "_nearMisses": [{
                "foo": {
                    "bar": {
                        "_to": "not right"
                    }
                },
                "_by": "not me"
            }]
        }]
    }
}, {
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_by": my_id
    }
}, {
    # Weird fields
    "messageID": random_id(),
    "type": "update",
    "object": {
        "~a": "b",
    }
}, {
    # To myself
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "_to": my_id 
    }
}, {
    # To myself nested
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "foo": {
            "_to": my_id
        }
    }
}, {
    # Weird fields
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "~a": "b",
    }
}, {
    # Valid args
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "x": { "$exists": "true" },
        "$and": {
            "y": "a",
            "z": "b"
        }
    }
}]

invalid_requests = [{
    # no message ID
    "type": "update",
    "object": {}
}, {
    # Invalid message type
    "messageID": random_id(),
    "type": "dupdate",
    "object": {}
}, {
    # Missing required field
    "messageID": random_id(),
    "type": "update"
}, {
    "messageID": random_id(),
    "type": "delete"
}, {
    "messageID": random_id(),
    "type": "subscribe"
}, {
    "messageID": random_id(),
    "type": "unsubscribe"
}, {
    # only special fields can start with _
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_notright": 12345
    }
}, {
    # _id should be an string
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_id": 12345,
    }
}, {
    # _to should be an array
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_to": random_id()
    }
}, {
    # _to should include strings
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_to": [12345]
    }
}, {
    # by can only be my id
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_by": random_id()
    }
}, {
    # nested fields should also follow convention
    "messageID": random_id(),
    "type": "update",
    "object": {
        "foo": {
            "_bar": "asdf"
        }
    }
}, {
    # nested fields should also follow convention
    "messageID": random_id(),
    "type": "update",
    "object": {
        "foo": {
            "_id": 12345
        }
    }
}, {
    # _contexts is an array
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_contexts": {}
    }
}, {
    # _contexts only includes objects
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_contexts": ["asdf"]
    }
}, {
    # objects only have relevant fields
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_contexts": [{
            "foo": "bar"
        }]
    }
}, {
    # nearmisses is an array
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_contexts": [{
            "_nearMisses": {}
        }]
    }
}, {
    # Invalid args
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "$asdf": "wassup"
    }
}, {
    # Invalid args nested
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "foo": {
            "$asdf": "wassup"
        }
    }
}, {
    # To someone else
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "_to": "notme"
    }
}, {
    # To someone else nested
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "foo": {
            "_to": "notme"
        }
    }
}]

if __name__ == "__main__":
    asyncio.run(main())
