#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = owner_id_and_token()
    async with websocket_connect(my_token) as ws:
        for request in valid_requests(my_id):
            await send(ws, request)
            response = await recv(ws)
            while response["type"] in ["updates", "deletes"]:
                response = await recv(ws)
            if response["type"] == "error":
                assert response["reason"] != "validation"
        print("All valid requests passed, as expected")
        for request in invalid_requests(my_id):
            await send(ws, request)
            response = await recv(ws)
            while response["type"] in ["updates", "deletes"]:
                response = await recv(ws)
            assert response["type"] == "error"
            assert response["reason"] == "validation"
        print("All invalid requests failed, as expected")

def valid_requests(my_id):
    object_id, proof = object_id_and_proof(my_id)

    return [{
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_id": object_id
    },
    "idProof": proof
}, {
    "messageID": "alkjd$$\~934820fk",
    "type": "update",
    "object": {
        "_id": object_id
    },
    "idProof": None
}, {
    "messageID": "a"*64,
    "type": "delete",
    "objectID": object_id
}, {
    "messageID": "iueiruwoeiurowiwf1293  -e 👍",
    "type": "subscribe",
    "query": {},
    "since": None,
    "queryID": random_id()
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "query": {},
    "since": "666f6f2d6261722d71757578",
    "queryID": random_id()
}, {
    "messageID": random_id(),
    "type": "unsubscribe",
    "queryID": random_id()
}, {
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "foo": True
    }
}, {
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "foo": None
    }
}, {
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "foo": 123.4
    }
}, {
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "foo": 1234
    }
}, {
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_to": [str(uuid4()), str(uuid4())],
        "foo": {
            "blah": False,
            "bar": {
                "asdf": 1234.14
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
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_by": my_id
    }
}, {
    # Weird fields
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "~a": "b",
    }
}, {
    # To myself
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "_to": my_id 
    },
    "since": None,
    "queryID": random_id()
}, {
    # To myself nested
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "foo": {
            "_to": my_id
        }
    },
    "since": None,
    "queryID": random_id()
}, {
    # Weird fields
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "~a": "b",
    },
    "since": None,
    "queryID": random_id()
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
    },
    "since": None,
    "queryID": random_id()
}]

def invalid_requests(my_id):
    object_id, proof = object_id_and_proof(my_id)

    return [{
    # no message ID
    "type": "update",
    "object": {
        "_id": object_id
    },
    "idProof": proof
}, {
    # Invalid message type
    "messageID": random_id(),
    "type": "dupdate",
    "object": {
        "_id": object_id
    },
    "idProof": proof
}, {
    # Missing required field
    "messageID": random_id(),
    "type": "update",
    "idProof": proof
}, {
    "messageID": random_id(),
    "type": "update",
    "object": {}
}, {
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_id": object_id
    }
}, {
    "messageID": random_id(),
    "type": "delete"
}, {
    "messageID": random_id(),
    "type": "subscribe"
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "query": {}
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "since": None
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "queryID": random_id()
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "query": {},
    "queryID": random_id()
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "since": None,
    "queryID": random_id()
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "query": {},
    "since": None
}, {
    "messageID": random_id(),
    "type": "unsubscribe"
}, {
    # only special fields can start with _
    "messageID": random_id(),
    "type": "update",
    "object": {
        "_id": object_id,
        "_notright": 12345
    },
    "idProof": proof
}, {
    # _id should be an string
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": 12345,
    }
}, {
    # _id should be exactly length 64
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": "a15d"
    }
}, {
    # _id should be hex
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": "z"*64
    }
}, {
    # messageID too long
    "messageID": "q"*65,
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id
    }
}, {
    # _to should be an array
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_to": str(uuid4())
    }
}, {
    # _to should by UUIDs
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_to": ["12345"]
    }
}, {
    # by can only be my id
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_by": str(uuid4())
    }
}, {
    # _contexts is an array
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_contexts": {}
    }
}, {
    # _contexts only includes objects
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_contexts": ["asdf"]
    }
}, {
    # objects only have relevant fields
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_contexts": [{
            "foo": "bar"
        }]
    }
}, {
    # nearmisses is an array
    "messageID": random_id(),
    "type": "update",
    "idProof": proof,
    "object": {
        "_id": object_id,
        "_contexts": [{
            "_nearMisses": {}
        }]
    }
}, {
    "messageID": random_id(),
    "type": "subscribe",
    "query": {},
    "since": "asdf",
    "queryID": random_id()
}, {
    # Invalid operators
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "$asdf": "wassup"
    },
    "since": None,
    "queryID": random_id()
}, {
    # Invalid operators nested
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "foo": {
            "$asdf": "wassup"
        }
    },
    "since": None,
    "queryID": random_id()
}, {
    # To someone else
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "_to": str(uuid4())
    },
    "since": None,
    "queryID": random_id()
}, {
    # To someone else nested
    "messageID": random_id(),
    "type": "subscribe",
    "query": {
        "foo": {
            "_to": str(uuid4())
        }
    },
    "since": None,
    "queryID": random_id()
}]

if __name__ == "__main__":
    asyncio.run(main())
