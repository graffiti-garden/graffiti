#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    async with websocket_connect() as ws:

        # Try sending an invalid proof
        await ws.send("sdlfkj")
        result = await recv_json(ws)
        assert result['error'] == 'validation'
        assert result['detail'] == 'invalid peer proof'
        print("Denied invalid peer proof")

    async with websocket_connect() as ws:

        # Try sending a valid proof
        proof = random_sha()
        peer_id = sha(proof)
        await ws.send(proof)
        result = await recv_json(ws)
        assert result['peer_id'] == peer_id
        print("Accepted valid peer proof")

        # Send valid requests
        for request in valid_requests:
            await send_json(ws, request)
            response = await recv_json(ws)
            assert 'reply' in response
            assert response['reply'] != 'error'
        print("All valid tests passed")

        for request in invalid_requests:
            await send_json(ws, request)
            response = await recv_json(ws)
            assert 'reply' in response
            assert response['reply'] == 'error'
        print("All invalid tests failed")

valid_requests = [{
    "messageID": random_sha(),
    "action": "announce",
    "info_hashes": [random_sha()]
}, {
    "messageID": random_sha(),
    "action": "unannounce",
    "info_hashes": [random_sha(), random_sha()]
}, {
    "messageID": random_sha(),
    "action": "subscribe",
    "info_hashes": [random_sha(), random_sha(), random_sha()]
}, {
    "messageID": random_sha(),
    "action": "unsubscribe",
    "info_hashes": [random_sha(), random_sha(), random_sha()]
}]

invalid_requests = [{
    # Missing field
    "action": "announce",
    "info_hashes": [random_sha()]
}, {
    "messageID": random_sha(),
    "info_hashes": [random_sha(), random_sha()]
}, {
    "messageID": random_sha(),
    "action": "subscribe",
}, {
    # extra field
    "messageID": random_sha(),
    "action": "unsubscribe",
    "info_hashes": [random_sha(), random_sha(), random_sha()],
    "foo": "bar"
}, {
    # Wrong action
    "messageID": random_sha(),
    "action": "asdf",
    "info_hashes": [random_sha()]
}, {
    # Invalid message ID
    "messageID": "asdfkjdkf",
    "action": "announce",
    "info_hashes": [random_sha()]
}, {
    # Empty hashes
    "messageID": random_sha(),
    "action": "announce",
    "info_hashes": []
}, {
    # Non-unique hashes
    "messageID": random_sha(),
    "action": "announce",
    "info_hashes": [random_sha()]*2
}]

if __name__ == "__main__":
    asyncio.run(main())
