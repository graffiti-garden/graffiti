#!/usr/bin/env python3

import asyncio
from utils import *
import json

async def announcer(peer_proof, info_hash, time_to_die):
    async with websocket_connect() as ws:
        await ws.send(peer_proof)
        await ws.recv()
        await send_json(ws, {
            "messageID": random_sha(),
            "action": "announce",
            "info_hashes": [info_hash, random_sha(), random_sha()]
        })
        reply = await recv_json(ws)
        assert reply["reply"] == "announced"
        await asyncio.sleep(time_to_die)

def announcers(num, info_hash, time_to_die):
    proofs = [random_sha() for i in range(num)]
    return { sha(proof): asyncio.create_task(
        announcer(proof, info_hash, time_to_die)) for proof in proofs }

async def main():

    peer_proof = random_sha()
    async with websocket_connect() as ws:
        print("Subscribing with a peer ID...")
        await ws.send(peer_proof)
        reply = await recv_json(ws)
        assert 'peer_id' in reply

        async with websocket_connect() as ws2:
            await ws2.send(peer_proof)
            reply = await recv_json(ws2)
            assert reply['reply'] == 'error'
            assert reply['detail'].startswith("Peer with ID")
            print("Can't subscribe with the same ID")

    print("Creating a subscriber...")
    info_hash = random_sha()
    async with websocket_connect() as ws:
        await ws.send(random_sha())
        await ws.recv()
        await send_json(ws, {
            "messageID": random_sha(),
            "action": "subscribe",
            "info_hashes": [info_hash]
        })
        reply = await recv_json(ws)
        assert reply["reply"] == "subscribed"

        # Create an announcer
        print("Announcing..")
        peer_proof = random_sha()
        async with websocket_connect() as ws2:
            await ws2.send(peer_proof)
            peer_id = (await recv_json(ws2))['peer_id']
            await send_json(ws2, {
                "messageID": random_sha(),
                "action": "announce",
                "info_hashes": [info_hash]
            })
            reply = await recv_json(ws2)
            assert reply["reply"] == "announced"

            # See if subscriber gets it
            update = await recv_json(ws)
            assert update['action'] == 'announce'
            assert update['peer'] == peer_id
            assert update['info_hash'] == info_hash
            print("seen by subscriber")

            print("sending another announce")
            await send_json(ws2, {
                "messageID": random_sha(),
                "action": "announce",
                "info_hashes": [info_hash]
            })
            reply = await recv_json(ws2)
            assert reply["reply"] == "announced"

            update = await recv_json(ws)
            assert update['action'] == 'unannounce'
            assert update['peer'] == peer_id
            assert update['info_hash'] == info_hash
            print("subscriber sees unannounce..")

            update = await recv_json(ws)
            assert update['action'] == 'announce'
            assert update['peer'] == peer_id
            assert update['info_hash'] == info_hash
            print("..and reannounce")

            print("sending an unannounce")
            await send_json(ws2, {
                "messageID": random_sha(),
                "action": "unannounce",
                "info_hashes": [info_hash]
            })
            reply = await recv_json(ws2)
            assert reply["reply"] == "unannounced"

            update = await recv_json(ws)
            assert update['action'] == 'unannounce'
            assert update['peer'] == peer_id
            assert update['info_hash'] == info_hash
            print("seen by subscriber")

            print("sending another unannounce")
            await send_json(ws2, {
                "messageID": random_sha(),
                "action": "unannounce",
                "info_hashes": [info_hash]
            })
            reply = await recv_json(ws2)
            assert reply["reply"] == "unannounced"

            timed_out = False
            try:
                await asyncio.wait_for(recv_json(ws), timeout=1)
            except asyncio.TimeoutError:
                timed_out = True
            assert timed_out
            print("subscriber sees nothing")

    # Create 50 that die after 2 second
    N = 50
    info_hash = random_sha()
    print("making a bunch of announcers")
    fast = announcers(N, info_hash, 2)
    # and 50 that die after 4 seconds
    slow = announcers(N, info_hash, 4)

    # Wait a bit for them to come online
    await asyncio.sleep(1)

    async with websocket_connect() as ws:
        await ws.send(random_sha())
        await ws.recv()
        await send_json(ws, {
            "messageID": random_sha(),
            "action": "subscribe",
            "info_hashes": [info_hash, random_sha(), random_sha()]
        })
        reply = await recv_json(ws)
        assert reply["reply"] == "subscribed"

        peers = [(await recv_json(ws))["peer"] for i in range(N+N)]
        # Make sure we got all the old peers
        assert set(peers) == (fast|slow).keys()
        print("subscriber sees all announcers")

        # Wait for the fast ones to die
        peers = [(await recv_json(ws))["peer"] for i in range(N)]
        assert set(peers) == fast.keys()

        print("subscriber sees disconnected ones unannounce")

        await send_json(ws, {
            "messageID": random_sha(),
            "action": "unsubscribe",
            "info_hashes": [info_hash, random_sha(), random_sha()]
        })
        reply = await recv_json(ws)
        assert reply["reply"] == "unsubscribed"

        # Wait for the slow ones to die
        timed_out = False
        try:
            await asyncio.wait_for(recv_json(ws), timeout=3)
        except asyncio.TimeoutError:
            timed_out = True
        assert timed_out
        print("subscriber does not get any more messages")

    for peer_id, task in (fast|slow).items():
        await task

if __name__ == "__main__":
    asyncio.run(main())
