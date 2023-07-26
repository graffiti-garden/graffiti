#!/usr/bin/env python3

import asyncio
import aiohttp
import uuid

base = "http://localhost:8000"

async def main():
     async with aiohttp.ClientSession() as session:
        print("Getting an invalid key is None")
        async with session.get(f"{base}/key/asdf") as response:
            assert response.status == 404
            assert await response.json() == None

        print("Posting an invalid key")
        credential = {
          "id": str(uuid.uuid4()),
          "algorithm": "ES256"
        }
        async with session.post(f"{base}/key", json=credential) as response:
            assert response.status == 422

        print("Posting a key")
        credential = {
          "id": str(uuid.uuid4()),
          "publicKey": str(uuid.uuid4()),
          "algorithm": "ES256"
        }
        async with session.post(f"{base}/key", json=credential) as response:
            assert response.status == 200
            assert await response.json() == "inserted"

        print("Getting the key")
        async with session.get(f"{base}/key/{credential['id']}") as response:
            assert response.status == 200
            out = await response.json()
            assert out
            assert out["id"] == credential["id"]
            assert out["publicKey"] == credential["publicKey"]
            assert out["algorithm"] == credential["algorithm"]

        print("Double posting a key results in error")
        async with session.post(f"{base}/key", json=credential) as response:
            assert response.status == 409
            assert await response.json() == "key already exists"
        credential = credential | {
          "publicKey": str(uuid.uuid4()),
        }
        async with session.post(f"{base}/key", json=credential) as response:
            assert response.status == 409
            assert await response.json() == "key already exists"

if __name__ == "__main__":
    asyncio.run(main())