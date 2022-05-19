#!/usr/bin/env python3

import jwt
import json
import asyncio
import websockets
from uuid import uuid4
from os import getenv

secret = getenv('AUTH_SECRET')
async def main():

    my_id = str(uuid4())
    my_token = jwt.encode({
        "type": "token",
        "owner_id": my_id
        }, secret, algorithm="HS256")

    async with websockets.connect(f"ws://localhost:8000/?token={my_token}") as ws:
        for request in valid_requests(my_id):
            await ws.send(json.dumps(request))
            response = json.loads(await ws.recv())
            assert response["type"] != "validationError"
        print("All valid requests passed, as expected")
        for request in invalid_requests:
            await ws.send(json.dumps(request))
            response = json.loads(await ws.recv())
            assert response["type"] == "validationError"
        print("All invalid requests failed, as expected")


def valid_requests(my_id):
    return [{
    "messageID": str(uuid4()),
    "type": "update",
    "object": {}
}, {
    "messageID": str(uuid4()),
    "type": "delete",
    "object_id": str(uuid4())
}, {
    "messageID": str(uuid4()),
    "type": "subscribe",
    "query": {}
}, {
    "messageID": str(uuid4()),
    "type": "unsubscribe",
    "query_hash": str(uuid4())
}, {
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_id": str(uuid4()),
        "_to": [str(uuid4()), str(uuid4())],
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
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_by": my_id
    }
}]

invalid_requests = [{
    # no message ID
    "type": "update",
    "object": {}
}, {
    # Invalid message type
    "messageID": str(uuid4()),
    "type": "dupdate",
    "object": {}
}, {
    # Missing required field
    "messageID": str(uuid4()),
    "type": "update"
}, {
    "messageID": str(uuid4()),
    "type": "delete"
}, {
    "messageID": str(uuid4()),
    "type": "subscribe"
}, {
    "messageID": str(uuid4()),
    "type": "unsubscribe"
}, {
    # only special fields can start with _
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_notright": 12345
    }
}, {
    # _id should be an string
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_id": 12345,
    }
}, {
    # _to should be an array
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_to": str(uuid4())
    }
}, {
    # _to should include strings
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_to": [12345]
    }
}, {
    # by can only be my id
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_by": "notmyid"
    }
}, {
    # nested fields should also follow convention
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "foo": {
            "_bar": "asdf"
        }
    }
}, {
    # nested fields should also follow convention
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "foo": {
            "_id": 12345
        }
    }
}, {
    # _contexts is an array
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_contexts": {}
    }
}, {
    # _contexts only includes objects
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_contexts": ["asdf"]
    }
}, {
    # objects only have relevant fields
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_contexts": [{
            "foo": "bar"
        }]
    }
}, {
    # nearmisses is an array
    "messageID": str(uuid4()),
    "type": "update",
    "object": {
        "_contexts": [{
            "_nearMisses": {}
        }]
    }
}]

if __name__ == "__main__":
    asyncio.run(main())
